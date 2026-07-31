import { describe, expect, it } from 'vitest';
import {
  configJsonSchema,
  createDomainConfigSchema,
  createOrganizationConfigSchema,
  domainConfigKeySchema,
  staticDomainConfigSchema,
  updateDomainConfigSchema,
  updateOrganizationConfigSchema,
} from '../src/validation';

describe('white-label JSON validation', () => {
  it.each([
    'token',
    'accessToken',
    'clientSecret',
    'dbPassword',
    'signingKey',
    'api_key',
    'private-key',
    '__proto__',
    'databaseUrl',
    'connectionString',
    'dsn',
    'authorization',
    'auth',
    'jwt',
    'oauth',
    'bearer',
  ])('recursively rejects sensitive key variant %s', (key) => {
    const config = {
      safe: {
        nestedArray: [
          { publicValue: true },
          { deeper: { [key]: 'must-not-be-stored' } },
        ],
      },
    };
    expect(configJsonSchema.safeParse(config).success).toBe(false);
  });

  it('allows non-sensitive public configuration keys', () => {
    expect(configJsonSchema.safeParse({
      endpoints: { mainApiBaseUrl: 'https://api.example.com' },
      branding: { primaryColor: '#123456' },
    }).success).toBe(true);
  });

  it.each([
    'ｔｏｋｅｎ',
    'tоken',
    '中文字段',
    'white label',
  ])('rejects non-ASCII or ambiguous field name %s', (key) => {
    expect(configJsonSchema.safeParse({ [key]: 'value' }).success).toBe(false);
  });
});

describe('main-frontend domain config validation', () => {
  const snapshot = {
    name: 'dev.xrugc.com',
    description: 'XR UGC Dev',
    is_active: true,
    fallback_domain: 'xrugc.com',
    default_config: { icon: 'https://cdn.example/icon.webp' },
    configs: {
      'zh-CN': { title: 'XR UGC Dev' },
    },
  };

  it.each([
    'DEV.XRUGC.COM',
    'https://dev.xrugc.com',
    'dev.xrugc.com/path',
    'dev xrugc',
    '.dev.xrugc.com',
    'dev..xrugc.com',
  ])('rejects unsafe or non-lowercase config key %s', (configKey) => {
    expect(domainConfigKeySchema.safeParse(configKey).success).toBe(false);
  });

  it('accepts default, a slug, and dot-separated domain-family keys', () => {
    expect(domainConfigKeySchema.safeParse('default').success).toBe(true);
    expect(domainConfigKeySchema.safeParse('campus-agent').success).toBe(true);
    expect(domainConfigKeySchema.safeParse('dev.xrugc.com').success).toBe(true);
  });

  it('requires the complete StaticDomainConfig shape and allows future public fields', () => {
    const parsed = staticDomainConfigSchema.safeParse({
      ...snapshot,
      future_public_field: { enabled: true },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.future_public_field).toEqual({ enabled: true });
    }
    expect(staticDomainConfigSchema.safeParse({
      ...snapshot,
      configs: undefined,
    }).success).toBe(false);
  });

  it('requires configKey to exactly match config.name', () => {
    const parsed = createDomainConfigSchema.safeParse({
      configKey: 'xrugc.com',
      config: snapshot,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(expect.objectContaining({
        path: ['config', 'name'],
      }));
    }
  });

  it('applies recursive secret checks to the full domain snapshot', () => {
    expect(staticDomainConfigSchema.safeParse({
      ...snapshot,
      default_config: { nested: { accessToken: 'must-not-be-stored' } },
    }).success).toBe(false);
  });

  it('requires external fallback snapshots to contain local Unity config data', () => {
    expect(staticDomainConfigSchema.safeParse({
      ...snapshot,
      default_config: {},
      configs: {},
    }).success).toBe(false);
    expect(staticDomainConfigSchema.safeParse({
      ...snapshot,
      default_config: {},
      configs: { 'zh-CN': {} },
    }).success).toBe(false);
    expect(staticDomainConfigSchema.safeParse({
      ...snapshot,
      fallback_domain: snapshot.name,
      default_config: {},
      configs: {},
    }).success).toBe(true);
    expect(staticDomainConfigSchema.safeParse({
      ...snapshot,
      default_config: {},
      configs: { 'zh-CN': { title: 'Local data' } },
    }).success).toBe(true);
  });

  it('defaults domain creates to schema v1 and requires explicit v1 on updates', () => {
    const create = createDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      config: snapshot,
    });
    expect(create.success).toBe(true);
    if (create.success) {
      expect(create.data.schemaVersion).toBe(1);
    }
    expect(createDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      schemaVersion: 2,
      config: snapshot,
    }).success).toBe(false);
    expect(updateDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      revision: 1,
      config: snapshot,
    }).success).toBe(false);
    expect(updateDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      schemaVersion: 2,
      revision: 1,
      config: snapshot,
    }).success).toBe(false);
    expect(updateDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      schemaVersion: 1,
      revision: 1,
      config: snapshot,
    }).success).toBe(true);
  });
});

describe('organization schema version validation', () => {
  it('defaults creates to schema v1 and requires explicit v1 on updates', () => {
    const create = createOrganizationConfigSchema.safeParse({
      organizationId: 12,
      config: {},
    });
    expect(create.success).toBe(true);
    if (create.success) {
      expect(create.data.schemaVersion).toBe(1);
    }
    expect(createOrganizationConfigSchema.safeParse({
      organizationId: 12,
      schemaVersion: 2,
      config: {},
    }).success).toBe(false);
    expect(updateOrganizationConfigSchema.safeParse({
      revision: 1,
      config: {},
    }).success).toBe(false);
    expect(updateOrganizationConfigSchema.safeParse({
      schemaVersion: 2,
      revision: 1,
      config: {},
    }).success).toBe(false);
    expect(updateOrganizationConfigSchema.safeParse({
      schemaVersion: 1,
      revision: 1,
      config: {},
    }).success).toBe(true);
  });
});
