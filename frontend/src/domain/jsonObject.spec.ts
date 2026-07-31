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

function validateOrganization(value: unknown) {
  return validateJsonObjectText(JSON.stringify(value), 'organization')
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

describe('JSON object schemas', () => {
  it('keeps organization JSON deliberately open while requiring an object', () => {
    expect(
      validateJsonObjectText('{"theme":{"primary":"blue"}}', 'organization'),
    ).toMatchObject({ valid: true })
    expect(validateJsonObjectText('[]', 'organization')).toMatchObject({
      valid: false,
      issues: [{ code: 'object-required' }],
    })
    expect(validateJsonObjectText('null', 'organization')).toMatchObject({
      valid: false,
      issues: [{ code: 'object-required' }],
    })
  })

  it('reports malformed JSON before schema validation', () => {
    expect(validateJsonObjectText('{', 'domain')).toMatchObject({
      valid: false,
      issues: [{ code: 'syntax' }],
    })
  })

  it('accepts the main-frontend StaticDomainConfig shape and future fields', () => {
    expect(
      validateJsonObjectText(
        JSON.stringify({ ...validDomainConfig, future_option: true }),
        'domain',
      ),
    ).toMatchObject({
      valid: true,
      value: {
        name: 'dev.xrugc.com',
        description: 'XR UGC Dev',
      },
    })
  })

  it('mirrors the 12-level depth boundary', () => {
    expect(validateOrganization(nestedConfig(12))).toMatchObject({
      valid: true,
    })
    expect(validateOrganization(nestedConfig(13))).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining('12 levels'),
        }),
      ],
    })
  })

  it('mirrors the 5000-node boundary without exceeding array limits', () => {
    expect(validateOrganization(nodeBoundaryConfig(994))).toMatchObject({
      valid: true,
    })
    expect(validateOrganization(nodeBoundaryConfig(995))).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining('5000 JSON values'),
        }),
      ],
    })
  })

  it('mirrors string and array length boundaries', () => {
    expect(
      validateOrganization({
        value: 'x'.repeat(JSON_SECURITY_LIMITS.maxStringLength),
      }),
    ).toMatchObject({ valid: true })
    expect(
      validateOrganization({
        value: 'x'.repeat(JSON_SECURITY_LIMITS.maxStringLength + 1),
      }),
    ).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining('16384 characters'),
        }),
      ],
    })
    expect(
      validateOrganization({
        values: Array.from(
          { length: JSON_SECURITY_LIMITS.maxArrayLength },
          () => 0,
        ),
      }),
    ).toMatchObject({ valid: true })
    expect(
      validateOrganization({
        values: Array.from(
          { length: JSON_SECURITY_LIMITS.maxArrayLength + 1 },
          () => 0,
        ),
      }),
    ).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining('1000 values'),
        }),
      ],
    })
  })

  it('measures the canonical JSON payload at the UTF-8 64 KiB boundary', () => {
    const exactBoundary = {
      a: 'x'.repeat(16_384),
      b: 'x'.repeat(16_384),
      c: 'x'.repeat(16_384),
      d: 'x'.repeat(16_355),
    }
    expect(new TextEncoder().encode(JSON.stringify(exactBoundary))).toHaveLength(
      JSON_SECURITY_LIMITS.maxBytes,
    )
    expect(validateOrganization(exactBoundary)).toMatchObject({ valid: true })

    expect(
      validateOrganization({ ...exactBoundary, d: `${exactBoundary.d}x` }),
    ).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining('65536 bytes'),
        }),
      ],
    })

    expect(
      validateOrganization({
        one: '界'.repeat(11_000),
        two: '界'.repeat(11_000),
      }),
    ).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })
  })

  it('accepts only backend-safe ASCII field names', () => {
    expect(
      validateOrganization({ 'brand.logo-url': '中文内容', _enabled: true }),
    ).toMatchObject({ valid: true })
    expect(
      validateOrganization({
        ['a'.repeat(JSON_SECURITY_LIMITS.maxFieldNameLength)]: true,
      }),
    ).toMatchObject({ valid: true })
    expect(
      validateOrganization({
        ['a'.repeat(JSON_SECURITY_LIMITS.maxFieldNameLength + 1)]: true,
      }),
    ).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: 'security' })],
    })
    expect(validateOrganization({ 主题: '蓝色' })).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'security',
          message: expect.stringContaining('ASCII letters'),
        }),
      ],
    })
    expect(validateOrganization({ '-invalid': true })).toMatchObject({
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
    expect(validateOrganization({ safe: { [key]: 'value' } })).toMatchObject({
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
    const result = validateJsonObjectText(JSON.stringify(incomplete), 'domain')

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
      'domain',
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

    expect(key191).toHaveLength(191)
    expect(key193).toHaveLength(193)
    expect(
      validateJsonObjectText(
        JSON.stringify({
          ...validDomainConfig,
          name: key191,
          description: '   ',
        }),
        'domain',
      ),
    ).toMatchObject({ valid: true })
    expect(
      validateJsonObjectText(
        JSON.stringify({
          ...validDomainConfig,
          name: key193,
          description: '   ',
        }),
        'domain',
      ),
    ).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          code: 'schema',
          path: '/description',
        }),
      ],
    })
  })

  it('rejects a purely external fallback because Unity snapshots are self-contained', () => {
    const result = validateJsonObjectText(
      JSON.stringify({
        ...validDomainConfig,
        fallback_domain: 'default',
        default_config: {},
        configs: { 'zh-CN': {}, 'en-US': {} },
      }),
      'domain',
    )

    expect(result).toMatchObject({
      valid: false,
      issues: [
        {
          code: 'schema',
          path: '/fallback_domain',
          message:
            'an external fallback requires local default_config or configs data; Unity snapshots must be self-contained',
        },
      ],
    })
  })

  it.each([
    {
      label: 'local default_config',
      fallback_domain: 'default',
      default_config: { logo: '/local.svg' },
      configs: {},
    },
    {
      label: 'one non-empty locale config',
      fallback_domain: 'default',
      default_config: {},
      configs: { 'zh-CN': {}, 'en-US': { title: 'Local' } },
    },
    {
      label: 'self fallback without recursive lookup',
      fallback_domain: 'dev.xrugc.com',
      default_config: {},
      configs: {},
    },
    {
      label: 'no fallback',
      fallback_domain: null,
      default_config: {},
      configs: {},
    },
  ])('accepts $label', ({ fallback_domain, default_config, configs }) => {
    expect(
      validateJsonObjectText(
        JSON.stringify({
          ...validDomainConfig,
          fallback_domain,
          default_config,
          configs,
        }),
        'domain',
      ),
    ).toMatchObject({ valid: true })
  })

  it('formats and compacts valid JSON objects without changing data', () => {
    expect(formatJsonObjectText('{"a":1,"nested":{"b":2}}')).toBe(
      '{\n  "a": 1,\n  "nested": {\n    "b": 2\n  }\n}',
    )
    expect(
      formatJsonObjectText('{\n  "a": 1,\n  "nested": { "b": 2 }\n}', true),
    ).toBe('{"a":1,"nested":{"b":2}}')
    expect(formatJsonObjectText('[]')).toBeNull()
  })
})
