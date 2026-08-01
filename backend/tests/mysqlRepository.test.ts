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

  it('uses config.name as the physical key on create', async () => {
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
  });

  it('ignores stale projection columns when reading a domain snapshot', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(activeSnapshot, {
        domain: 'legacy-exact-host.example.com',
        display_name: 'Legacy exact host',
      })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.findDomainConfig(34)).resolves.toMatchObject({
      configKey: activeSnapshot.name,
      displayName: activeSnapshot.description,
    });
  });

  it('finds the first configured candidate in caller precedence without filtering status', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(activeSnapshot, { is_enabled: 0 })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);
    const result = await repository.findFirstDomainConfig([
      'dev.xrugc.com',
      'xrugc.com',
    ]);

    expect(result).toMatchObject({ configKey: 'dev.xrugc.com', enabled: false });
    const sql = String(execute.mock.calls[0]?.[0]);
    expect(sql).toContain("JSON_EXTRACT(config_json, '$.name')");
    expect(sql).toContain('ORDER BY FIELD');
    expect(sql).not.toContain('is_enabled = 1');
    expect(execute.mock.calls[0]?.[1]).toEqual([
      'dev.xrugc.com',
      'xrugc.com',
      'dev.xrugc.com',
      'xrugc.com',
    ]);
  });

  it('does not issue SQL for an empty candidate list', async () => {
    const execute = vi.fn();
    const repository = repositoryWithExecute(execute);
    await expect(repository.findFirstDomainConfig([])).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('searches canonical JSON identity rather than projection columns', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const execute = vi.fn().mockResolvedValue([[{ total: 0 }], []]);
    const repository = new MysqlWhiteLabelRepository({
      query,
      execute,
    } as unknown as Pool);

    await repository.listDomainConfigs({ q: 'XR UGC', limit: 20, offset: 0 });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("JSON_EXTRACT(config_json, '$.name')");
    expect(sql).toContain("JSON_EXTRACT(config_json, '$.description')");
    expect(sql).toContain('COLLATE utf8mb4_unicode_ci');
    expect(sql).not.toContain('display_name LIKE');
  });
});
