import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { MysqlWhiteLabelRepository } from '../src/mysqlRepository';
import type { JsonObject } from '../src/types';

const activeConfig: JsonObject = {
  name: '主站',
  theme: { primaryColor: '#409eff' },
};

function domainRow(
  config: JsonObject = activeConfig,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 34,
    domain: 'dev.xrugc.com',
    display_name: 'XR UGC Dev',
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
  it('updates arbitrary JSON while the persisted record is enabled', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[domainRow(activeConfig, { is_enabled: 1 })], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[domainRow({ ...activeConfig, is_active: false }, { is_enabled: 1, revision: 4 })], []]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.updateDomainConfig(34, {
      schemaVersion: 1,
      revision: 3,
      config: { ...activeConfig, is_active: false },
    }, '1')).resolves.toMatchObject({ kind: 'updated' });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('enables independently of similarly named JSON fields', async () => {
    const inactiveSnapshot = { ...activeConfig, is_active: false };
    const execute = vi.fn()
      .mockResolvedValueOnce([[domainRow(inactiveSnapshot)], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[domainRow(inactiveSnapshot, { is_enabled: 1, revision: 4 })], []]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.setDomainConfigEnabled(
      34,
      3,
      true,
      '1',
    )).resolves.toMatchObject({ kind: 'updated' });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('uses the external configKey as the physical key on create', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ insertId: 34 }, []])
      .mockResolvedValueOnce([[domainRow(activeConfig, { domain: 'caller-supplied-key' })], []]);
    const repository = repositoryWithExecute(execute);

    const created = await repository.createDomainConfig({
      configKey: 'caller-supplied-key',
      displayName: 'Catalog label',
      schemaVersion: 1,
      config: activeConfig,
    }, '1');

    expect(created.configKey).toBe('caller-supplied-key');
    expect(execute.mock.calls[1]?.[1]?.[0]).toBe('caller-supplied-key');
    expect(execute.mock.calls[1]?.[1]?.[1]).toBe('Catalog label');
  });

  it('keeps the physical key immutable on update', async () => {
    const updatedConfig = { ...activeConfig, name: '更新品牌' };
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
    expect(execute.mock.calls[1]?.[1]?.[0]).toBe(JSON.stringify(updatedConfig));
  });

  it('uses the database key and preserves independent JSON name on read', async () => {
    const execute = vi.fn().mockResolvedValueOnce([
      [domainRow(activeConfig, {
        domain: 'legacy-exact-host.example.com',
        display_name: 'Legacy exact host',
        config_json: JSON.stringify({ ...activeConfig, name: 'stale.example.com' }),
      })],
      [],
    ]);
    const repository = repositoryWithExecute(execute);

    await expect(repository.findDomainConfig(34)).resolves.toMatchObject({
      configKey: 'legacy-exact-host.example.com',
      displayName: 'Legacy exact host',
      config: expect.objectContaining({ name: 'stale.example.com' }),
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

  it('searches the authoritative database key and catalog display name', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const execute = vi.fn().mockResolvedValue([[{ total: 0 }], []]);
    const repository = new MysqlWhiteLabelRepository({
      query,
      execute,
    } as unknown as Pool);

    await repository.listDomainConfigs({ q: 'XR UGC', limit: 20, offset: 0 });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('domain LIKE');
    expect(sql).toContain('display_name');
    expect(sql).toContain('COLLATE utf8mb4_unicode_ci');
    expect(sql).not.toContain('JSON_EXTRACT');
  });
});
