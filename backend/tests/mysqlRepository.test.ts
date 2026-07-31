import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { MysqlWhiteLabelRepository } from '../src/mysqlRepository';
import type { StaticDomainConfig } from '../src/types';

const activeSnapshot: StaticDomainConfig = {
  name: 'dev.xrugc.com',
  description: 'XR UGC Dev',
  is_active: true,
  fallback_domain: 'xrugc.com',
  default_config: { homepage: 'https://dev.xrugc.com/' },
  configs: {},
};

function domainRow(
  config: StaticDomainConfig,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 34,
    domain: config.name,
    display_name: config.description || config.name,
    config_json: JSON.stringify(config),
    schema_version: 1,
    revision: 3,
    is_enabled: 0,
    created_by: 1,
    updated_by: 1,
    status_changed_by: null,
    created_at: '2026-01-01 00:00:00.000',
    updated_at: '2026-01-01 00:00:00.000',
    status_changed_at: null,
    ...overrides,
  };
}

function repositoryWithExecute(execute: ReturnType<typeof vi.fn>) {
  return new MysqlWhiteLabelRepository({ execute } as unknown as Pool);
}

describe('MySQL domain repository invariants', () => {
  it('rejects an inactive update while the persisted record is enabled', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(activeSnapshot, { is_enabled: 1 })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.updateDomainConfig(34, {
      configKey: activeSnapshot.name,
      schemaVersion: 1,
      revision: 3,
      config: { ...activeSnapshot, is_active: false },
    }, '1')).rejects.toMatchObject({ status: 422 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects enabling a persisted inactive snapshot', async () => {
    const inactiveSnapshot = { ...activeSnapshot, is_active: false };
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(inactiveSnapshot)],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.setDomainConfigEnabled(
      34,
      3,
      true,
      '1',
    )).rejects.toMatchObject({ status: 422 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('uses config.name as the physical key on create even for a direct repository call', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ insertId: 34 }, []])
      .mockResolvedValueOnce([[domainRow(activeSnapshot)], []]);
    const repository = repositoryWithExecute(execute);

    const created = await repository.createDomainConfig({
      configKey: 'caller-supplied-key',
      schemaVersion: 1,
      config: activeSnapshot,
    }, '1');

    expect(created.configKey).toBe(activeSnapshot.name);
    expect(execute.mock.calls[1]?.[1]?.[0]).toBe(activeSnapshot.name);
    expect(execute.mock.calls[1]?.[1]?.[1]).toBe(activeSnapshot.description);
  });

  it('uses config.name as the physical key on update', async () => {
    const renamedSnapshot = { ...activeSnapshot, name: 'campus-agent' };
    const execute = vi.fn()
      .mockResolvedValueOnce([[domainRow(activeSnapshot)], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[
        domainRow(renamedSnapshot, { revision: 4 }),
      ], []]);
    const repository = repositoryWithExecute(execute);

    const updated = await repository.updateDomainConfig(34, {
      configKey: 'caller-supplied-key',
      schemaVersion: 1,
      revision: 3,
      config: renamedSnapshot,
    }, '1');

    expect(updated).toMatchObject({
      kind: 'updated',
      value: { configKey: renamedSnapshot.name },
    });
    expect(execute.mock.calls[2]?.[1]?.[0]).toBe(renamedSnapshot.name);
    expect(execute.mock.calls[2]?.[1]?.[1]).toBe(renamedSnapshot.description);
  });

  it('rejects a canonical config.name already held by a stale projection row', async () => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: 34 }], []]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.createDomainConfig({
      configKey: activeSnapshot.name,
      schemaVersion: 1,
      config: activeSnapshot,
    }, '1')).rejects.toMatchObject({ status: 409 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('ignores stale projection columns when reading a domain snapshot', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [
        domainRow(activeSnapshot, {
          domain: 'legacy-exact-host.example.com',
          display_name: 'Legacy exact host',
        }),
      ],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.findDomainConfig(34)).resolves.toMatchObject({
      configKey: activeSnapshot.name,
      displayName: activeSnapshot.description,
    });
  });

  it('falls back to config.name when the JSON description is blank', async () => {
    const snapshot = { ...activeSnapshot, description: '   ' };
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(snapshot, { display_name: 'Legacy exact host' })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.findDomainConfig(34)).resolves.toMatchObject({
      configKey: snapshot.name,
      displayName: snapshot.name,
    });
  });

  it('derives assignment domain identity from its JSON snapshot', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [
        {
          assignment_id: 11,
          organization_id: 42,
          domain_id: 34,
          revision: 2,
          is_enabled: 1,
          organization_name: 'buyer',
          organization_title: 'Buyer',
          organization_enabled: 1,
          domain: 'legacy-exact-host.example.com',
          display_name: 'Legacy exact host',
          domain_config_json: JSON.stringify(activeSnapshot),
          domain_enabled: 1,
          created_by: 1,
          updated_by: 1,
          status_changed_by: null,
          created_at: '2026-01-01 00:00:00.000',
          updated_at: '2026-01-01 00:00:00.000',
          status_changed_at: null,
        },
      ],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.findAssignment(null, 11)).resolves.toMatchObject({
      domain: {
        configKey: activeSnapshot.name,
        displayName: activeSnapshot.description,
      },
    });
  });

  it('keeps the resolved config key equal to domain.config.name', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [
        {
          assignment_revision: 2,
          organization_id: 42,
          organization_name: 'buyer',
          organization_title: 'Buyer',
          organization_revision: 3,
          organization_schema_version: 1,
          organization_config_json: JSON.stringify({ buyerTheme: 'blue' }),
          domain_id: 34,
          domain: 'legacy-exact-host.example.com',
          domain_revision: 4,
          domain_schema_version: 1,
          domain_config_json: JSON.stringify(activeSnapshot),
        },
      ],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    const resolved = await repository.resolveEnabledAssignment(42, 34);
    expect(resolved?.domain.configKey).toBe(activeSnapshot.name);
    expect(resolved?.domain.config.name).toBe(activeSnapshot.name);
  });

  it('searches the JSON identity instead of stale projection columns', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const execute = vi.fn().mockResolvedValue([[{ total: 0 }], []]);
    const repository = new MysqlWhiteLabelRepository({
      query,
      execute,
    } as unknown as Pool);

    await repository.listDomainConfigs({ q: 'XR UGC', limit: 20, offset: 0 });
    await repository.listAssignments(null, { q: 'XR UGC', limit: 20, offset: 0 });

    const domainSql = String(query.mock.calls[0]?.[0]);
    expect(domainSql).toContain("JSON_EXTRACT(config_json, '$.name')");
    expect(domainSql).toContain("JSON_EXTRACT(config_json, '$.description')");
    expect(domainSql).toContain('COLLATE utf8mb4_unicode_ci');
    expect(domainSql).not.toContain('display_name LIKE');

    const assignmentSql = String(query.mock.calls[1]?.[0]);
    expect(assignmentSql).toContain("JSON_EXTRACT(d.config_json, '$.name')");
    expect(assignmentSql).toContain("JSON_EXTRACT(d.config_json, '$.description')");
    expect(assignmentSql).toContain('COLLATE utf8mb4_unicode_ci');
    expect(assignmentSql).not.toContain('d.display_name LIKE');
  });
});
