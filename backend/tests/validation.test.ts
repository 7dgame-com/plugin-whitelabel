import { describe, expect, it } from 'vitest';
import {
  configJsonSchema,
  createDomainConfigSchema,
  domainConfigCandidates,
  domainConfigKeySchema,
  requestedDomainSchema,
  resolveQuerySchema,
  updateDomainConfigSchema,
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

describe('external key and independent JSON validation', () => {
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
  const { name: configKey, ...content } = snapshot;

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

  it('stores configKey outside JSON while allowing name as independent brand data', () => {
    expect(createDomainConfigSchema.safeParse({
      configKey,
      config: { name: '主站', theme: { primaryColor: '#409eff' } },
    }).success).toBe(true);
  });

  it('applies recursive secret checks to independent JSON', () => {
    expect(createDomainConfigSchema.safeParse({
      configKey,
      config: { nested: { accessToken: 'must-not-be-stored' } },
    }).success).toBe(false);
  });

  it('defaults domain creates to schema v1 and requires explicit v1 on updates', () => {
    const create = createDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      config: content,
    });
    expect(create.success).toBe(true);
    if (create.success) {
      expect(create.data.schemaVersion).toBe(1);
    }
    expect(createDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      schemaVersion: 2,
      config: content,
    }).success).toBe(false);
    expect(updateDomainConfigSchema.safeParse({
      revision: 1,
      config: content,
    }).success).toBe(false);
    expect(updateDomainConfigSchema.safeParse({
      schemaVersion: 2,
      revision: 1,
      config: content,
    }).success).toBe(false);
    expect(updateDomainConfigSchema.safeParse({
      schemaVersion: 1,
      revision: 1,
      config: content,
    }).success).toBe(true);
    expect(updateDomainConfigSchema.safeParse({
      configKey: snapshot.name,
      schemaVersion: 1,
      revision: 1,
      config: content,
    }).success).toBe(false);
  });
});

describe('public hostname validation and candidate generation', () => {
  it.each([
    ['DEV.XRUGC.COM', 'dev.xrugc.com'],
    ['dev.xrugc.com.', 'dev.xrugc.com'],
    ['BÜCHER.example', 'xn--bcher-kva.example'],
    ['campus-agent', 'campus-agent'],
    ['default', 'default'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(requestedDomainSchema.parse(input)).toBe(expected);
  });

  it.each([
    'https://dev.xrugc.com',
    'dev.xrugc.com:443',
    'dev.xrugc.com/path',
    'dev.xrugc.com?x=1',
    'dev.xrugc.com#fragment',
    'user@dev.xrugc.com',
    'dev xrugc.com',
    'dev..xrugc.com',
    'dev.xrugc.com..',
  ])('rejects non-hostname input %s', (input) => {
    expect(requestedDomainSchema.safeParse(input).success).toBe(false);
  });

  it('tries the exact hostname and then each parent domain', () => {
    expect(domainConfigCandidates('www.d.dev.xrugc.com')).toEqual([
      'www.d.dev.xrugc.com',
      'd.dev.xrugc.com',
      'dev.xrugc.com',
      'xrugc.com',
    ]);
    expect(domainConfigCandidates('d.dev.xrugc.com')).toEqual([
      'd.dev.xrugc.com',
      'dev.xrugc.com',
      'xrugc.com',
    ]);
    expect(domainConfigCandidates('dev.xrugc.com')).toEqual([
      'dev.xrugc.com',
      'xrugc.com',
    ]);
  });

  it('accepts exactly one domain query and rejects legacy o/d', () => {
    expect(resolveQuerySchema.parse({ domain: 'DEV.XRUGC.COM.' })).toEqual({
      domain: 'dev.xrugc.com',
    });
    expect(resolveQuerySchema.safeParse({ o: 1, d: 1 }).success).toBe(false);
    expect(resolveQuerySchema.safeParse({ domain: 'dev.xrugc.com', o: 1 }).success)
      .toBe(false);
  });
});
