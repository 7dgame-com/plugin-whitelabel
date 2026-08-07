import { describe, expect, it } from 'vitest'
import {
  formatJsonObjectText,
  isValidDomainConfigKey,
  JSON_SECURITY_LIMITS,
  validateJsonObjectText,
} from './jsonObject'

const validDomainConfig = {
  name: 'dev.xrugc.com',
  description: 'XR UGC Dev',
  is_active: true,
  fallback_domain: 'default',
  default_config: { logo: '/brand/logo.svg' },
  configs: {
    'zh-CN': { title: '开发环境' },
  },
}

function validatePayload(defaultConfig: unknown) {
  return validateJsonObjectText(
    JSON.stringify({
      ...validDomainConfig,
      default_config: defaultConfig,
    }),
  )
}

function nestedConfig(depth: number): Record<string, unknown> {
  let value: unknown = 0
  for (let level = depth; level > 0; level -= 1) {
    value = { [`level_${level}`]: value }
  }
  return value as Record<string, unknown>
}

function nodeBoundaryConfig(lastArrayLength: number) {
  return {
    values_1: Array.from({ length: 1_000 }, () => null),
    values_2: Array.from({ length: 1_000 }, () => null),
    values_3: Array.from({ length: 1_000 }, () => null),
    values_4: Array.from({ length: 1_000 }, () => null),
    values_5: Array.from({ length: lastArrayLength }, () => null),
  }
}

describe('domain JSON schema', () => {
  it('reports malformed or non-object JSON before schema validation', () => {
    expect(validateJsonObjectText('{')).toMatchObject({
      valid: false,
      issues: [{ code: 'syntax' }],
    })
    expect(validateJsonObjectText('[]')).toMatchObject({
      valid: false,
      issues: [{ code: 'object-required' }],
    })
  })

  it('accepts the main-frontend StaticDomainConfig shape and future fields', () => {
    expect(
      validateJsonObjectText(
        JSON.stringify({ ...validDomainConfig, future_option: true }),
      ),
    ).toMatchObject({
      valid: true,
      value: {
        name: 'dev.xrugc.com',
        description: 'XR UGC Dev',
      },
    })
  })

  it('mirrors depth, node, string, array, and byte limits', () => {
    expect(validatePayload(nestedConfig(11))).toMatchObject({ valid: true })
    expect(validatePayload(nestedConfig(12))).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })

    expect(validatePayload(nodeBoundaryConfig(986))).toMatchObject({
      valid: true,
    })
    expect(validatePayload(nodeBoundaryConfig(987))).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })

    expect(
      validatePayload({
        value: 'x'.repeat(JSON_SECURITY_LIMITS.maxStringLength),
      }),
    ).toMatchObject({ valid: true })
    expect(
      validatePayload({
        value: 'x'.repeat(JSON_SECURITY_LIMITS.maxStringLength + 1),
      }),
    ).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })
    expect(
      validatePayload({
        values: Array.from(
          { length: JSON_SECURITY_LIMITS.maxArrayLength },
          () => 0,
        ),
      }),
    ).toMatchObject({ valid: true })
    expect(
      validatePayload({
        values: Array.from(
          { length: JSON_SECURITY_LIMITS.maxArrayLength + 1 },
          () => 0,
        ),
      }),
    ).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })

    expect(
      validatePayload({
        one: '界'.repeat(11_000),
        two: '界'.repeat(11_000),
      }),
    ).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining(String(JSON_SECURITY_LIMITS.maxBytes)),
        }),
      ],
    })
  })

  it('accepts only backend-safe field names', () => {
    expect(
      validatePayload({ 'brand.logo-url': '中文内容', _enabled: true }),
    ).toMatchObject({ valid: true })
    expect(validatePayload({ 主题: '蓝色' })).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })
    expect(validatePayload({ '-invalid': true })).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })
  })

  it.each([
    'auth',
    'authorization',
    'bearer',
    'jwt',
    'oauth',
    'proto',
    'prototype',
    'constructor',
    'dsn',
    'client_secret',
    'password',
    'api_key',
    'access-token',
    'credential',
    'private.key',
    'signing_key',
    'database_url',
    'connection-string',
  ])('rejects forbidden or sensitive key %s at any depth', (key) => {
    expect(validatePayload({ safe: { [key]: 'value' } })).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining('secrets must not be stored'),
        }),
      ],
    })
  })

  it('requires all six StaticDomainConfig fields', () => {
    const { configs: _configs, ...incomplete } = validDomainConfig
    const result = validateJsonObjectText(JSON.stringify(incomplete))

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'schema', path: '/configs' }),
      )
    }
  })

  it.each([
    ['default', true],
    ['dev.xrugc.com', true],
    ['ar-creator.cn', true],
    ['Dev.xrugc.com', false],
    ['https://dev.xrugc.com', false],
    ['dev..xrugc.com', false],
    ['dev.xrugc.com/path', false],
  ])('validates the lower-case safe config key %s', (value, valid) => {
    expect(isValidDomainConfigKey(value)).toBe(valid)
  })

  it('rejects an unsafe name and invalid language config values', () => {
    const result = validateJsonObjectText(
      JSON.stringify({
        ...validDomainConfig,
        name: 'https://dev.xrugc.com/path',
        configs: { 'zh-CN': 'not-an-object' },
      }),
    )

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(['/name', '/configs/zh-CN']),
      )
    }
  })

  it('requires a description only when the config key exceeds 191 characters', () => {
    const key191 = [
      'a'.repeat(63),
      'b'.repeat(63),
      'c'.repeat(63),
    ].join('.')
    const key193 = `${key191}.d`

    expect(
      validateJsonObjectText(
        JSON.stringify({
          ...validDomainConfig,
          name: key191,
          description: '   ',
        }),
      ),
    ).toMatchObject({ valid: true })
    expect(
      validateJsonObjectText(
        JSON.stringify({
          ...validDomainConfig,
          name: key193,
          description: '   ',
        }),
      ),
    ).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ path: '/description' })],
    })
  })

  it('requires Unity snapshots to contain local data for external fallback', () => {
    expect(
      validateJsonObjectText(
        JSON.stringify({
          ...validDomainConfig,
          fallback_domain: 'default',
          default_config: {},
          configs: { 'zh-CN': {}, 'en-US': {} },
        }),
      ),
    ).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ path: '/fallback_domain' })],
    })
  })

  it('formats and compacts secure JSON objects without changing data', () => {
    expect(formatJsonObjectText('{"a":1,"nested":{"b":2}}')).toBe(
      '{\n  "a": 1,\n  "nested": {\n    "b": 2\n  }\n}',
    )
    expect(
      formatJsonObjectText('{\n  "a": 1,\n  "nested": { "b": 2 }\n}', true),
    ).toBe('{"a":1,"nested":{"b":2}}')
    expect(formatJsonObjectText('[]')).toBeNull()
  })
})
