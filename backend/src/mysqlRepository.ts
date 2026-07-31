import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { conflict, notFound, unprocessable } from './errors';
import type {
  Assignment,
  DomainConfig,
  DomainConfigInput,
  DomainConfigUpdate,
  JsonObject,
  ListOptions,
  ListResult,
  OrganizationConfig,
  OrganizationConfigInput,
  OrganizationConfigUpdate,
  OrganizationScope,
  ResolvedWhiteLabel,
  StaticDomainConfig,
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

interface OrganizationRow extends AuditRow {
  organization_id: string | number;
  organization_name: string;
  organization_title: string;
  config_json: string | JsonObject;
  schema_version: number;
  revision: string | number;
  is_enabled: number | boolean;
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

interface AssignmentRow extends AuditRow {
  assignment_id: string | number;
  organization_id: string | number;
  domain_id: string | number;
  revision: string | number;
  is_enabled: number | boolean;
  organization_name: string;
  organization_title: string;
  organization_enabled: number | boolean;
  domain: string;
  display_name: string;
  domain_enabled: number | boolean;
}

interface ResolvedRow extends RowDataPacket {
  assignment_revision: string | number;
  organization_id: string | number;
  organization_name: string;
  organization_title: string;
  organization_revision: string | number;
  organization_schema_version: number;
  organization_config_json: string | JsonObject;
  domain_id: string | number;
  domain: string;
  domain_revision: string | number;
  domain_schema_version: number;
  domain_config_json: string | JsonObject;
}

interface CountRow extends RowDataPacket {
  total: string | number;
}

function mysqlCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function parseJson<Value extends JsonObject = JsonObject>(value: string | JsonObject): Value {
  return (typeof value === 'string' ? JSON.parse(value) : value) as Value;
}

function domainDisplayName(config: StaticDomainConfig): string {
  return config.description.trim() || config.name;
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

function mapOrganization(row: OrganizationRow): OrganizationConfig {
  return {
    organizationId: Number(row.organization_id),
    organizationName: row.organization_name,
    organizationTitle: row.organization_title,
    config: parseJson(row.config_json),
    schemaVersion: Number(row.schema_version),
    revision: Number(row.revision),
    enabled: Boolean(row.is_enabled),
    ...auditFields(row),
  };
}

function mapDomain(row: DomainRow): DomainConfig {
  const config = parseJson<StaticDomainConfig>(row.config_json);
  return {
    domainId: Number(row.id),
    configKey: row.domain,
    displayName: row.display_name,
    config,
    schemaVersion: Number(row.schema_version),
    revision: Number(row.revision),
    enabled: Boolean(row.is_enabled),
    ...auditFields(row),
  };
}

function mapAssignment(row: AssignmentRow): Assignment {
  return {
    assignmentId: Number(row.assignment_id),
    organizationId: Number(row.organization_id),
    domainId: Number(row.domain_id),
    revision: Number(row.revision),
    enabled: Boolean(row.is_enabled),
    organization: {
      name: row.organization_name,
      title: row.organization_title,
      enabled: Boolean(row.organization_enabled),
    },
    domain: {
      configKey: row.domain,
      displayName: row.display_name,
      enabled: Boolean(row.domain_enabled),
    },
    ...auditFields(row),
  };
}

function mapResolved(row: ResolvedRow): ResolvedWhiteLabel {
  return {
    assignmentRevision: Number(row.assignment_revision),
    organization: {
      id: Number(row.organization_id),
      name: row.organization_name,
      title: row.organization_title,
      revision: Number(row.organization_revision),
      schemaVersion: Number(row.organization_schema_version),
      config: parseJson(row.organization_config_json),
    },
    domain: {
      id: Number(row.domain_id),
      configKey: row.domain,
      revision: Number(row.domain_revision),
      schemaVersion: Number(row.domain_schema_version),
      config: parseJson<StaticDomainConfig>(row.domain_config_json),
    },
  };
}

function appendScope(
  where: string[],
  parameters: SqlParameter[],
  scope: OrganizationScope,
  column = 'organization_id',
): void {
  if (scope === null) {
    return;
  }
  if (scope.length === 0) {
    where.push('1 = 0');
    return;
  }
  where.push(`${column} IN (${scope.map(() => '?').join(', ')})`);
  parameters.push(...scope);
}

function searchPattern(q: string): string {
  return `%${q.replace(/=/g, '==').replace(/%/g, '=%').replace(/_/g, '=_')}%`;
}

const assignmentSelect = `
  SELECT
    a.*,
    a.id AS assignment_id,
    o.organization_name,
    o.organization_title,
    o.is_enabled AS organization_enabled,
    d.domain,
    d.display_name,
    d.is_enabled AS domain_enabled
  FROM white_label_assignment a
  INNER JOIN white_label_organization_config o ON o.organization_id = a.organization_id
  INNER JOIN white_label_domain_config d ON d.id = a.domain_id
`;

export class MysqlWhiteLabelRepository implements WhiteLabelRepository {
  constructor(private readonly pool: Pool) {}

  async health(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async listOrganizationConfigs(
    scope: OrganizationScope,
    options: ListOptions,
  ): Promise<ListResult<OrganizationConfig>> {
    const where: string[] = [];
    const parameters: SqlParameter[] = [];
    appendScope(where, parameters, scope);
    if (options.q !== undefined) {
      const pattern = searchPattern(options.q);
      where.push(`(
        organization_name LIKE ? ESCAPE '='
        OR organization_title LIKE ? ESCAPE '='
      )`);
      parameters.push(pattern, pattern);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    // MySQL's binary prepared-statement protocol rejects DOUBLE-typed
    // placeholders in LIMIT/OFFSET. mysql2's text query path still escapes
    // every value while rendering the validated integer pagination operands.
    const [rows] = await this.pool.query<OrganizationRow[]>(
      `SELECT * FROM white_label_organization_config
       ${whereSql}
       ORDER BY updated_at DESC, organization_id ASC
       LIMIT ? OFFSET ?`,
      [...parameters, options.limit, options.offset],
    );
    const [countRows] = await this.pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM white_label_organization_config ${whereSql}`,
      parameters,
    );
    return { items: rows.map(mapOrganization), total: Number(countRows[0]?.total ?? 0) };
  }

  async createOrganizationConfig(
    input: OrganizationConfigInput,
    actorId: string,
  ): Promise<OrganizationConfig> {
    try {
      await this.pool.execute<ResultSetHeader>(
        `INSERT INTO white_label_organization_config (
          organization_id, organization_name, organization_title, config_json,
          schema_version, revision, is_enabled, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [
          input.organizationId,
          input.organizationName,
          input.organizationTitle,
          JSON.stringify(input.config),
          input.schemaVersion,
          actorId,
          actorId,
        ],
      );
    } catch (error) {
      if (mysqlCode(error) === 'ER_DUP_ENTRY') {
        throw conflict(
          'ORGANIZATION_CONFIG_CONFLICT',
          'A configuration already exists for this organization',
        );
      }
      throw error;
    }
    const created = await this.findOrganizationConfig(null, input.organizationId);
    if (!created) {
      throw new Error('Created organization configuration could not be reloaded');
    }
    return created;
  }

  async findOrganizationConfig(
    scope: OrganizationScope,
    organizationId: number,
  ): Promise<OrganizationConfig | null> {
    const where = ['organization_id = ?'];
    const parameters: SqlParameter[] = [organizationId];
    appendScope(where, parameters, scope);
    const [rows] = await this.pool.execute<OrganizationRow[]>(
      `SELECT * FROM white_label_organization_config WHERE ${where.join(' AND ')} LIMIT 1`,
      parameters,
    );
    return rows[0] ? mapOrganization(rows[0]) : null;
  }

  async updateOrganizationConfig(
    scope: OrganizationScope,
    organizationId: number,
    input: OrganizationConfigUpdate,
    actorId: string,
  ): Promise<VersionedMutationResult<OrganizationConfig>> {
    const where = ['organization_id = ?', 'revision = ?'];
    const whereParameters: SqlParameter[] = [organizationId, input.revision];
    appendScope(where, whereParameters, scope);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE white_label_organization_config
       SET organization_name = ?, organization_title = ?, config_json = ?,
           schema_version = ?, revision = revision + 1, updated_by = ?,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE ${where.join(' AND ')}`,
      [
        input.organizationName,
        input.organizationTitle,
        JSON.stringify(input.config),
        input.schemaVersion,
        actorId,
        ...whereParameters,
      ],
    );
    if (result.affectedRows === 1) {
      const updated = await this.findOrganizationConfig(scope, organizationId);
      return updated ? { kind: 'updated', value: updated } : { kind: 'not_found' };
    }
    const current = await this.findOrganizationConfig(scope, organizationId);
    return current
      ? { kind: 'revision_conflict', currentRevision: current.revision }
      : { kind: 'not_found' };
  }

  async setOrganizationConfigEnabled(
    scope: OrganizationScope,
    organizationId: number,
    expectedRevision: number,
    enabled: boolean,
    actorId: string,
  ): Promise<VersionedMutationResult<OrganizationConfig>> {
    const where = ['organization_id = ?', 'revision = ?', 'is_enabled <> ?'];
    const whereParameters: SqlParameter[] = [organizationId, expectedRevision, enabled];
    appendScope(where, whereParameters, scope);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE white_label_organization_config
       SET is_enabled = ?, revision = revision + 1, updated_by = ?,
           status_changed_by = ?, updated_at = CURRENT_TIMESTAMP(3),
           status_changed_at = CURRENT_TIMESTAMP(3)
       WHERE ${where.join(' AND ')}`,
      [enabled, actorId, actorId, ...whereParameters],
    );
    if (result.affectedRows === 1) {
      const updated = await this.findOrganizationConfig(scope, organizationId);
      return updated ? { kind: 'updated', value: updated } : { kind: 'not_found' };
    }
    const current = await this.findOrganizationConfig(scope, organizationId);
    if (!current) {
      return { kind: 'not_found' };
    }
    return current.revision === expectedRevision
      ? { kind: 'unchanged', value: current }
      : { kind: 'revision_conflict', currentRevision: current.revision };
  }

  async listDomainConfigs(options: ListOptions): Promise<ListResult<DomainConfig>> {
    const where: string[] = [];
    const parameters: SqlParameter[] = [];
    if (options.q !== undefined) {
      const pattern = searchPattern(options.q);
      where.push(`(domain LIKE ? ESCAPE '=' OR display_name LIKE ? ESCAPE '=')`);
      parameters.push(pattern, pattern);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
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
    let result: ResultSetHeader;
    try {
      [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO white_label_domain_config (
          domain, display_name, config_json, schema_version, revision,
          is_enabled, created_by, updated_by
        ) VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
        [
          input.config.name,
          domainDisplayName(input.config),
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

    let result: ResultSetHeader;
    try {
      [result] = await this.pool.execute<ResultSetHeader>(
        `UPDATE white_label_domain_config
         SET domain = ?, display_name = ?, config_json = ?, schema_version = ?,
             revision = revision + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND revision = ?`,
        [
          input.config.name,
          domainDisplayName(input.config),
          JSON.stringify(input.config),
          input.schemaVersion,
          actorId,
          domainId,
          input.revision,
        ],
      );
    } catch (error) {
      if (mysqlCode(error) === 'ER_DUP_ENTRY') {
        throw conflict('DOMAIN_CONFIG_CONFLICT', 'The domain config key is already configured');
      }
      throw error;
    }
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

  async listAssignments(
    scope: OrganizationScope,
    options: ListOptions,
  ): Promise<ListResult<Assignment>> {
    const where: string[] = [];
    const parameters: SqlParameter[] = [];
    appendScope(where, parameters, scope, 'a.organization_id');
    if (options.q !== undefined) {
      const pattern = searchPattern(options.q);
      where.push(`(
        o.organization_name LIKE ? ESCAPE '='
        OR o.organization_title LIKE ? ESCAPE '='
        OR d.domain LIKE ? ESCAPE '='
        OR d.display_name LIKE ? ESCAPE '='
      )`);
      parameters.push(pattern, pattern, pattern, pattern);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await this.pool.query<AssignmentRow[]>(
      `${assignmentSelect}
       ${whereSql}
       ORDER BY a.updated_at DESC, a.organization_id ASC, a.domain_id ASC
       LIMIT ? OFFSET ?`,
      [...parameters, options.limit, options.offset],
    );
    const [countRows] = await this.pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM white_label_assignment a
       INNER JOIN white_label_organization_config o ON o.organization_id = a.organization_id
       INNER JOIN white_label_domain_config d ON d.id = a.domain_id
       ${whereSql}`,
      parameters,
    );
    return { items: rows.map(mapAssignment), total: Number(countRows[0]?.total ?? 0) };
  }

  async createAssignment(
    organizationId: number,
    domainId: number,
    actorId: string,
  ): Promise<Assignment> {
    let result: ResultSetHeader;
    try {
      [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO white_label_assignment (
          organization_id, domain_id, revision, is_enabled, created_by, updated_by
        ) VALUES (?, ?, 1, 0, ?, ?)`,
        [organizationId, domainId, actorId, actorId],
      );
    } catch (error) {
      if (mysqlCode(error) === 'ER_DUP_ENTRY') {
        throw conflict('ASSIGNMENT_CONFLICT', 'This organization/domain assignment already exists');
      }
      if (mysqlCode(error) === 'ER_NO_REFERENCED_ROW_2') {
        throw notFound();
      }
      throw error;
    }
    const created = await this.findAssignment(null, result.insertId);
    if (!created) {
      throw new Error('Created assignment could not be reloaded');
    }
    return created;
  }

  async findAssignment(
    scope: OrganizationScope,
    assignmentId: number,
  ): Promise<Assignment | null> {
    const where = ['a.id = ?'];
    const parameters: SqlParameter[] = [assignmentId];
    appendScope(where, parameters, scope, 'a.organization_id');
    const [rows] = await this.pool.execute<AssignmentRow[]>(
      `${assignmentSelect} WHERE ${where.join(' AND ')} LIMIT 1`,
      parameters,
    );
    return rows[0] ? mapAssignment(rows[0]) : null;
  }

  async setAssignmentEnabled(
    assignmentId: number,
    expectedRevision: number,
    enabled: boolean,
    actorId: string,
  ): Promise<VersionedMutationResult<Assignment>> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE white_label_assignment
       SET is_enabled = ?, revision = revision + 1, updated_by = ?,
           status_changed_by = ?, updated_at = CURRENT_TIMESTAMP(3),
           status_changed_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND revision = ? AND is_enabled <> ?`,
      [enabled, actorId, actorId, assignmentId, expectedRevision, enabled],
    );
    if (result.affectedRows === 1) {
      const updated = await this.findAssignment(null, assignmentId);
      return updated ? { kind: 'updated', value: updated } : { kind: 'not_found' };
    }
    const current = await this.findAssignment(null, assignmentId);
    if (!current) {
      return { kind: 'not_found' };
    }
    return current.revision === expectedRevision
      ? { kind: 'unchanged', value: current }
      : { kind: 'revision_conflict', currentRevision: current.revision };
  }

  async resolveEnabledAssignment(
    organizationId: number,
    domainId: number,
  ): Promise<ResolvedWhiteLabel | null> {
    const [rows] = await this.pool.execute<ResolvedRow[]>(
      `SELECT
         a.revision AS assignment_revision,
         o.organization_id,
         o.organization_name,
         o.organization_title,
         o.revision AS organization_revision,
         o.schema_version AS organization_schema_version,
         o.config_json AS organization_config_json,
         d.id AS domain_id,
         d.domain,
         d.revision AS domain_revision,
         d.schema_version AS domain_schema_version,
         d.config_json AS domain_config_json
       FROM white_label_assignment a
       INNER JOIN white_label_organization_config o ON o.organization_id = a.organization_id
       INNER JOIN white_label_domain_config d ON d.id = a.domain_id
       WHERE a.organization_id = ? AND a.domain_id = ?
         AND a.is_enabled = 1 AND o.is_enabled = 1 AND d.is_enabled = 1
         AND JSON_TYPE(JSON_EXTRACT(d.config_json, '$.is_active')) = 'BOOLEAN'
         AND JSON_UNQUOTE(JSON_EXTRACT(d.config_json, '$.is_active')) = 'true'
       LIMIT 1`,
      [organizationId, domainId],
    );
    return rows[0] ? mapResolved(rows[0]) : null;
  }
}
