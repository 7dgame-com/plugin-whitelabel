import { describe, expect, it } from 'vitest';
import {
  configJsonSchema,
  hostnameSchema,
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

describe('hostname validation', () => {
  it('requires at least two hostname labels', () => {
    expect(hostnameSchema.safeParse('localhost').success).toBe(false);
    expect(hostnameSchema.safeParse('example.com').success).toBe(true);
    expect(hostnameSchema.safeParse('代理.example.com').success).toBe(false);
  });
});
