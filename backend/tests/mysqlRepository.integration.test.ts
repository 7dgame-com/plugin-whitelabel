import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, type Pool } from 'mysql2/promise';
import { MysqlWhiteLabelRepository } from '../src/mysqlRepository';

const integrationEnabled = process.env.RUN_MYSQL_INTEGRATION === '1';
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration('MySQL white-label repository', () => {
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

    const schema = readFileSync(
      new URL('../db/schema.sql', import.meta.url),
      'utf8',
    );
    await pool.query(schema);
    repository = new MysqlWhiteLabelRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM white_label_assignment');
    await pool.query('DELETE FROM white_label_domain_config');
    await pool.query('DELETE FROM white_label_organization_config');
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('enforces scopes, revisions, foreign keys, and all three enabled layers', async () => {
    const firstOrganization = await repository.createOrganizationConfig({
      organizationId: 12_001,
      organizationName: 'buyer-one',
      organizationTitle: 'Buyer One',
      schemaVersion: 1,
      config: { buyerOnly: { color: '#123456' } },
    }, '9001');
    await repository.createOrganizationConfig({
      organizationId: 12_002,
      organizationName: 'buyer-two',
      organizationTitle: 'Buyer Two',
      schemaVersion: 1,
      config: { buyerOnly: { color: '#654321' } },
    }, '9001');

    const scoped = await repository.listOrganizationConfigs(
      [12_001],
      { limit: 100, offset: 0 },
    );
    expect(scoped.items.map((item) => item.organizationId)).toEqual([12_001]);
    expect(scoped.total).toBe(1);

    const domain = await repository.createDomainConfig({
      domain: 'agent.integration.example',
      displayName: 'Integration Agent',
      schemaVersion: 1,
      config: { agentOnly: { supportUrl: 'https://support.example' } },
    }, '9001');
    const domains = await repository.listDomainConfigs({
      q: 'integration',
      limit: 100,
      offset: 0,
    });
    expect(domains.items.map((item) => item.domainId)).toEqual([domain.domainId]);
    expect(domains.total).toBe(1);

    const assignment = await repository.createAssignment(
      firstOrganization.organizationId,
      domain.domainId,
      '9001',
    );
    await repository.createAssignment(12_002, domain.domainId, '9001');
    const scopedAssignments = await repository.listAssignments(
      [firstOrganization.organizationId],
      { q: 'agent.integration', limit: 100, offset: 0 },
    );
    expect(scopedAssignments.items.map((item) => item.assignmentId)).toEqual([
      assignment.assignmentId,
    ]);
    expect(scopedAssignments.total).toBe(1);

    await expect(repository.createAssignment(
      99_999,
      domain.domainId,
      '9001',
    )).rejects.toMatchObject({ status: 404 });

    expect(await repository.resolveEnabledAssignment(
      firstOrganization.organizationId,
      domain.domainId,
    )).toBeNull();

    const organizationEnabled = await repository.setOrganizationConfigEnabled(
      null,
      firstOrganization.organizationId,
      firstOrganization.revision,
      true,
      '9001',
    );
    expect(organizationEnabled.kind).toBe('updated');
    expect(await repository.resolveEnabledAssignment(
      firstOrganization.organizationId,
      domain.domainId,
    )).toBeNull();

    const domainEnabled = await repository.setDomainConfigEnabled(
      domain.domainId,
      domain.revision,
      true,
      '9001',
    );
    expect(domainEnabled.kind).toBe('updated');
    expect(await repository.resolveEnabledAssignment(
      firstOrganization.organizationId,
      domain.domainId,
    )).toBeNull();

    const assignmentEnabled = await repository.setAssignmentEnabled(
      assignment.assignmentId,
      assignment.revision,
      true,
      '9001',
    );
    expect(assignmentEnabled.kind).toBe('updated');

    const resolved = await repository.resolveEnabledAssignment(
      firstOrganization.organizationId,
      domain.domainId,
    );
    expect(resolved).toMatchObject({
      organization: {
        id: firstOrganization.organizationId,
        config: { buyerOnly: { color: '#123456' } },
      },
      domain: {
        id: domain.domainId,
        host: 'agent.integration.example',
        config: {
          agentOnly: { supportUrl: 'https://support.example' },
        },
      },
    });

    const staleUpdate = await repository.updateOrganizationConfig(
      null,
      firstOrganization.organizationId,
      {
        organizationName: firstOrganization.organizationName,
        organizationTitle: firstOrganization.organizationTitle,
        schemaVersion: 1,
        revision: firstOrganization.revision,
        config: { staleWrite: true },
      },
      '9002',
    );
    expect(staleUpdate).toMatchObject({
      kind: 'revision_conflict',
      currentRevision: 2,
    });

    if (domainEnabled.kind !== 'updated') {
      throw new Error('Expected the domain enable mutation to succeed');
    }
    const domainDisabled = await repository.setDomainConfigEnabled(
      domain.domainId,
      domainEnabled.value.revision,
      false,
      '9001',
    );
    expect(domainDisabled.kind).toBe('updated');
    expect(await repository.resolveEnabledAssignment(
      firstOrganization.organizationId,
      domain.domainId,
    )).toBeNull();
  });
});
