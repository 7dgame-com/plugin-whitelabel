import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { conflict, unprocessable } from './errors';
import type {
  DomainConfig,
  DomainConfigContent,
  DomainConfigInput,
  DomainConfigUpdate,
  JsonObject,
  ListOptions,
  ListResult,
  VersionedMutationResult,
  WhiteLabelRepository,
} from './types';

type SqlParameter = string | number | boolean;

interface AuditRow extends RowDataPacket {
  created_by: string | number;
  updated_by: string | number;
  status_changed_by: string | number | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string | null;
}

interface DomainRow extends AuditRow {
  id: string | number;
  domain: string;
  display_name: string;
  config_json: string | JsonObject;
  schema_version: number;
  revision: string | number;
  is_enabled: number | boolean;
}

interface CountRow extends RowDataPacket {
  total: string | number;
}

interface IdRow extends RowDataPacket {
  id: string | number;
}

function mysqlCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function parseJson<Value extends JsonObject = JsonObject>(value: string | JsonObject): Value {
  return (typeof value === 'string' ? JSON.parse(value) : value) as Value;
}

function storedDomainConfig(value: string | JsonObject): DomainConfigContent {
  const parsed = parseJson<JsonObject>(value);
  // Legacy rows stored identity inside config_json. The physical `domain`
  // column is authoritative now, so old `name` values are ignored on read and
  // disappear on the next write.
  const { name: _legacyName, ...content } = parsed;
  return content as DomainConfigContent;
}

function domainDisplayName(configKey: string, config: DomainConfigContent): string {
  return config.description.trim() || configKey;
}

function toIsoUtc(value: string): string {
  if (value.endsWith('Z')) {
    return new Date(value).toISOString();
  }
  return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
}

function auditFields(row: AuditRow) {
  return {
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    statusChangedBy: row.status_changed_by === null ? null : String(row.status_changed_by),
    createdAt: toIsoUtc(row.created_at),
    updatedAt: toIsoUtc(row.updated_at),
    statusChangedAt: row.status_changed_at === null ? null : toIsoUtc(row.status_changed_at),
  };
}

function mapDomain(row: DomainRow): DomainConfig {
  const config = storedDomainConfig(row.config_json);
  return {
    domainId: Number(row.id),
    configKey: row.domain,
    displayName: domainDisplayName(row.domain, config),
    config,
    schemaVersion: Number(row.schema_version),
    revision: Number(row.revision),
    enabled: Boolean(row.is_enabled),
    ...auditFields(row),
  };
}

function searchPattern(q: string): string {
  return `%${q.replace(/=/g, '==').replace(/%/g, '=%').replace(/_/g, '=_')}%`;
}

export class MysqlWhiteLabelRepository implements WhiteLabelRepository {
  constructor(private readonly pool: Pool) {}

  async health(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  private async domainConfigKeyExists(configKey: string): Promise<boolean> {
    const [rows] = await this.pool.execute<IdRow[]>(
      `SELECT id
       FROM white_label_domain_config
       WHERE domain = ?
       LIMIT 1`,
      [configKey],
    );
    return rows.length > 0;
  }

  async listDomainConfigs(options: ListOptions): Promise<ListResult<DomainConfig>> {
    const where: string[] = [];
    const parameters: SqlParameter[] = [];
    if (options.q !== undefined) {
      const pattern = searchPattern(options.q);
      where.push(`(
        domain LIKE ? ESCAPE '='
        OR JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.description'))
          COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '='
      )`);
      parameters.push(pattern, pattern);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    // MySQL's binary prepared-statement protocol rejects DOUBLE-typed
    // placeholders in LIMIT/OFFSET. The text query path still escapes every
    // value while rendering validated integer pagination operands.
    const [rows] = await this.pool.query<DomainRow[]>(
      `SELECT * FROM white_label_domain_config
       ${whereSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...parameters, options.limit, options.offset],
    );
    const [countRows] = await this.pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM white_label_domain_config ${whereSql}`,
      parameters,
    );
    return { items: rows.map(mapDomain), total: Number(countRows[0]?.total ?? 0) };
  }

  async createDomainConfig(input: DomainConfigInput, actorId: string): Promise<DomainConfig> {
    if (await this.domainConfigKeyExists(input.configKey)) {
      throw conflict('DOMAIN_CONFIG_CONFLICT', 'The domain config key is already configured');
    }
    let result: ResultSetHeader;
    try {
      [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO white_label_domain_config (
          domain, display_name, config_json, schema_version, revision,
          is_enabled, created_by, updated_by
        ) VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
        [
          input.configKey,
          domainDisplayName(input.configKey, input.config),
          JSON.stringify(input.config),
          input.schemaVersion,
          actorId,
          actorId,
        ],
      );
    } catch (error) {
      if (mysqlCode(error) === 'ER_DUP_ENTRY') {
        throw conflict('DOMAIN_CONFIG_CONFLICT', 'The domain config key is already configured');
      }
      throw error;
    }
    const created = await this.findDomainConfig(result.insertId);
    if (!created) {
      throw new Error('Created domain configuration could not be reloaded');
    }
    return created;
  }

  async findDomainConfig(domainId: number): Promise<DomainConfig | null> {
    const [rows] = await this.pool.execute<DomainRow[]>(
      'SELECT * FROM white_label_domain_config WHERE id = ? LIMIT 1',
      [domainId],
    );
    return rows[0] ? mapDomain(rows[0]) : null;
  }

  async findFirstDomainConfig(configKeys: readonly string[]): Promise<DomainConfig | null> {
    if (configKeys.length === 0) {
      return null;
    }
    const placeholders = configKeys.map(() => '?').join(', ');
    const [rows] = await this.pool.execute<DomainRow[]>(
      `SELECT *
       FROM white_label_domain_config
       WHERE domain IN (${placeholders})
       ORDER BY FIELD(domain, ${placeholders}), id ASC
       LIMIT 1`,
      [...configKeys, ...configKeys],
    );
    return rows[0] ? mapDomain(rows[0]) : null;
  }

  async updateDomainConfig(
    domainId: number,
    input: DomainConfigUpdate,
    actorId: string,
  ): Promise<VersionedMutationResult<DomainConfig>> {
    const currentBeforeUpdate = await this.findDomainConfig(domainId);
    if (!currentBeforeUpdate) {
      return { kind: 'not_found' };
    }
    if (currentBeforeUpdate.revision !== input.revision) {
      return {
        kind: 'revision_conflict',
        currentRevision: currentBeforeUpdate.revision,
      };
    }
    if (currentBeforeUpdate.enabled && !input.config.is_active) {
      throw unprocessable(
        'Disable the domain configuration before saving a snapshot with config.is_active=false',
        [{
          path: 'config.is_active',
          message: 'config.is_active must remain true while the plugin domain configuration is enabled',
        }],
      );
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE white_label_domain_config
       SET display_name = ?, config_json = ?, schema_version = ?,
           revision = revision + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND revision = ?`,
      [
        domainDisplayName(currentBeforeUpdate.configKey, input.config),
        JSON.stringify(input.config),
        input.schemaVersion,
        actorId,
        domainId,
        input.revision,
      ],
    );
    if (result.affectedRows === 1) {
      const updated = await this.findDomainConfig(domainId);
      return updated ? { kind: 'updated', value: updated } : { kind: 'not_found' };
    }
    const current = await this.findDomainConfig(domainId);
    return current
      ? { kind: 'revision_conflict', currentRevision: current.revision }
      : { kind: 'not_found' };
  }

  async setDomainConfigEnabled(
    domainId: number,
    expectedRevision: number,
    enabled: boolean,
    actorId: string,
  ): Promise<VersionedMutationResult<DomainConfig>> {
    const currentBeforeUpdate = await this.findDomainConfig(domainId);
    if (!currentBeforeUpdate) {
      return { kind: 'not_found' };
    }
    if (currentBeforeUpdate.revision !== expectedRevision) {
      return {
        kind: 'revision_conflict',
        currentRevision: currentBeforeUpdate.revision,
      };
    }
    if (enabled && !currentBeforeUpdate.config.is_active) {
      throw unprocessable(
        'A domain configuration with config.is_active=false cannot be enabled',
        [{
          path: 'config.is_active',
          message: 'Set config.is_active to true before enabling this domain configuration',
        }],
      );
    }
    if (currentBeforeUpdate.enabled === enabled) {
      return { kind: 'unchanged', value: currentBeforeUpdate };
    }

    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE white_label_domain_config
       SET is_enabled = ?, revision = revision + 1, updated_by = ?,
           status_changed_by = ?, updated_at = CURRENT_TIMESTAMP(3),
           status_changed_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND revision = ? AND is_enabled <> ?`,
      [enabled, actorId, actorId, domainId, expectedRevision, enabled],
    );
    if (result.affectedRows === 1) {
      const updated = await this.findDomainConfig(domainId);
      return updated ? { kind: 'updated', value: updated } : { kind: 'not_found' };
    }
    const current = await this.findDomainConfig(domainId);
    if (!current) {
      return { kind: 'not_found' };
    }
    return current.revision === expectedRevision
      ? { kind: 'unchanged', value: current }
      : { kind: 'revision_conflict', currentRevision: current.revision };
  }
}
