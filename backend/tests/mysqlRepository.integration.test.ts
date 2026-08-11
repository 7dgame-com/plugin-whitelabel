import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, type Pool } from 'mysql2/promise';
import { MysqlWhiteLabelRepository } from '../src/mysqlRepository';

const integrationEnabled = process.env.RUN_MYSQL_INTEGRATION === '1';
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration('MySQL domain-only white-label repository', () => {
  let pool: Pool;
  let repository: MysqlWhiteLabelRepository;

  beforeAll(async () => {
    const database = process.env.MYSQL_TEST_DATABASE ?? 'whitelabel_test';
    if (!/_test$/.test(database)) {
      throw new Error('MYSQL_TEST_DATABASE must end with "_test"');
    }

    pool = createPool({
      host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_TEST_PORT ?? 3338),
      database,
      user: process.env.MYSQL_TEST_USER ?? 'whitelabel',
      password: process.env.MYSQL_TEST_PASSWORD ?? 'integration-password',
      connectionLimit: 2,
      multipleStatements: true,
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: true,
    });

    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    await pool.query(schema);
    repository = new MysqlWhiteLabelRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM white_label_domain_config');
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('supports domain CRUD, optimistic revisions, and ordered candidate lookup', async () => {
    const snapshot = {
      name: '集成测试品牌',
      theme: { primaryColor: '#409eff' },
    };
    const created = await repository.createDomainConfig({
      configKey: 'dev.xrugc.com',
      displayName: 'Integration Domain',
      schemaVersion: 1,
      config: snapshot,
    }, '9001');
    expect(created).toMatchObject({
      configKey: 'dev.xrugc.com',
      displayName: 'Integration Domain',
      revision: 1,
      enabled: false,
    });

    const defaultSnapshot = { name: '默认品牌' };
    await repository.createDomainConfig({
      configKey: 'default',
      displayName: 'Default',
      schemaVersion: 1,
      config: defaultSnapshot,
    }, '9001');

    await expect(repository.findFirstDomainConfig([
      'missing.dev.xrugc.com',
      'dev.xrugc.com',
      'xrugc.com',
    ])).resolves.toMatchObject({ configKey: 'dev.xrugc.com', enabled: false });
    await expect(repository.findFirstDomainConfig(['missing.example.com']))
      .resolves.toBeNull();
    await expect(repository.findFirstDomainConfig(['default']))
      .resolves.toMatchObject({ configKey: 'default' });

    const enabled = await repository.setDomainConfigEnabled(
      created.domainId,
      created.revision,
      true,
      '9001',
    );
    expect(enabled).toMatchObject({ kind: 'updated', value: { revision: 2, enabled: true } });

    const stale = await repository.updateDomainConfig(created.domainId, {
      schemaVersion: 1,
      revision: 1,
      config: { ...snapshot, name: '过期写入' },
    }, '9002');
    expect(stale).toMatchObject({ kind: 'revision_conflict', currentRevision: 2 });

    const list = await repository.listDomainConfigs({
      q: 'integration',
      limit: 20,
      offset: 0,
    });
    expect(list.total).toBe(1);
    expect(list.items[0]?.domainId).toBe(created.domainId);
  });
});
