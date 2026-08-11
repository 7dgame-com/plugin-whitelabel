import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { MysqlWhiteLabelRepository } from '../src/mysqlRepository';
import type { DomainConfigContent } from '../src/types';

const activeConfig: DomainConfigContent = {
  description: 'XR UGC Dev',
  is_active: true,
  fallback_domain: 'xrugc.com',
  default_config: { homepage: 'https://dev.xrugc.com/' },
  configs: {},
};

function domainRow(
  config: DomainConfigContent = activeConfig,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 34,
    domain: 'dev.xrugc.com',
    display_name: config.description || 'dev.xrugc.com',
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
      [domainRow(activeConfig, { is_enabled: 1 })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.updateDomainConfig(34, {
      schemaVersion: 1,
      revision: 3,
      config: { ...activeConfig, is_active: false },
    }, '1')).rejects.toMatchObject({ status: 422 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects enabling a persisted inactive snapshot', async () => {
    const inactiveSnapshot = { ...activeConfig, is_active: false };
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

  it('uses the external configKey as the physical key on create', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ insertId: 34 }, []])
      .mockResolvedValueOnce([[domainRow(activeConfig, { domain: 'caller-supplied-key' })], []]);
    const repository = repositoryWithExecute(execute);

    const created = await repository.createDomainConfig({
      configKey: 'caller-supplied-key',
      schemaVersion: 1,
      config: activeConfig,
    }, '1');

    expect(created.configKey).toBe('caller-supplied-key');
    expect(execute.mock.calls[1]?.[1]?.[0]).toBe('caller-supplied-key');
    expect(execute.mock.calls[1]?.[1]?.[1]).toBe(activeConfig.description);
  });

  it('keeps the physical key immutable on update', async () => {
    const updatedConfig = { ...activeConfig, description: 'Updated label' };
    const execute = vi.fn()
      .mockResolvedValueOnce([[domainRow(activeConfig)], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[
        domainRow(updatedConfig, { revision: 4 }),
      ], []]);
    const repository = repositoryWithExecute(execute);

    const updated = await repository.updateDomainConfig(34, {
      schemaVersion: 1,
      revision: 3,
      config: updatedConfig,
    }, '1');

    expect(updated).toMatchObject({
      kind: 'updated',
      value: { configKey: 'dev.xrugc.com' },
    });
    expect(String(execute.mock.calls[1]?.[0])).not.toContain('SET domain =');
    expect(execute.mock.calls[1]?.[1]?.[0]).toBe('Updated label');
  });

  it('uses the database key and strips legacy JSON name on read', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(activeConfig, {
        domain: 'legacy-exact-host.example.com',
        display_name: 'Legacy exact host',
        config_json: JSON.stringify({ name: 'stale.example.com', ...activeConfig }),
      })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.findDomainConfig(34)).resolves.toMatchObject({
      configKey: 'legacy-exact-host.example.com',
      displayName: activeConfig.description,
      config: expect.not.objectContaining({ name: expect.anything() }),
    });
  });

  it('finds the first configured candidate in caller precedence without filtering status', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(activeConfig, { is_enabled: 0 })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);
    const result = await repository.findFirstDomainConfig([
      'dev.xrugc.com',
      'xrugc.com',
    ]);

    expect(result).toMatchObject({ configKey: 'dev.xrugc.com', enabled: false });
    const sql = String(execute.mock.calls[0]?.[0]);
    expect(sql).toContain('WHERE domain IN');
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

  it('searches the authoritative database key and JSON description', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const execute = vi.fn().mockResolvedValue([[{ total: 0 }], []]);
    const repository = new MysqlWhiteLabelRepository({
      query,
      execute,
    } as unknown as Pool);

    await repository.listDomainConfigs({ q: 'XR UGC', limit: 20, offset: 0 });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('domain LIKE');
    expect(sql).toContain("JSON_EXTRACT(config_json, '$.description')");
    expect(sql).toContain('COLLATE utf8mb4_unicode_ci');
    expect(sql).not.toContain('display_name LIKE');
  });
});
