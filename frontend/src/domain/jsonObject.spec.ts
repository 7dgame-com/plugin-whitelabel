import { describe, expect, it } from 'vitest'
import {
  formatJsonObjectText,
  isValidDomainConfigKey,
  JSON_SECURITY_LIMITS,
  validateJsonObjectText,
} from './jsonObject'

function nested(depth: number): Record<string, unknown> {
  let value: unknown = 0
  for (let level = depth; level > 0; level -= 1) value = { [`level_${level}`]: value }
  return value as Record<string, unknown>
}

describe('independent white-label JSON', () => {
  it('requires valid JSON whose root is an object', () => {
    expect(validateJsonObjectText('{')).toMatchObject({ valid: false, issues: [{ code: 'syntax' }] })
    expect(validateJsonObjectText('[]')).toMatchObject({ valid: false, issues: [{ code: 'object-required' }] })
  })

  it('allows arbitrary public content including a Chinese brand name', () => {
    expect(validateJsonObjectText(JSON.stringify({
      name: '主站',
      theme: { primaryColor: '#409eff' },
      locales: { 'zh-CN': { title: '欢迎' } },
    }))).toMatchObject({ valid: true, value: { name: '主站' } })
    expect(validateJsonObjectText('{}')).toMatchObject({ valid: true, value: {} })
  })

  it('enforces depth, string, array, and byte limits', () => {
    expect(validateJsonObjectText(JSON.stringify({ value: nested(11) }))).toMatchObject({ valid: true })
    expect(validateJsonObjectText(JSON.stringify({ value: nested(12) }))).toMatchObject({ valid: false })
    expect(validateJsonObjectText(JSON.stringify({ value: 'x'.repeat(JSON_SECURITY_LIMITS.maxStringLength + 1) }))).toMatchObject({ valid: false })
    expect(validateJsonObjectText(JSON.stringify({ value: Array.from({ length: JSON_SECURITY_LIMITS.maxArrayLength + 1 }, () => 0) }))).toMatchObject({ valid: false })
    expect(validateJsonObjectText(JSON.stringify({ one: '界'.repeat(11_000), two: '界'.repeat(11_000) }))).toMatchObject({ valid: false })
  })

  it.each(['auth', 'authorization', 'jwt', 'client_secret', 'password', 'api_key', 'access-token', 'database_url'])
    ('rejects sensitive field %s at any depth', (key) => {
      expect(validateJsonObjectText(JSON.stringify({ safe: { [key]: 'value' } })))
        .toMatchObject({ valid: false, issues: [expect.objectContaining({ code: 'security' })] })
    })

  it('accepts safe ASCII field names and rejects ambiguous names', () => {
    expect(validateJsonObjectText(JSON.stringify({ 'brand.logo-url': '中文内容', _enabled: true }))).toMatchObject({ valid: true })
    expect(validateJsonObjectText(JSON.stringify({ 主题: '蓝色' }))).toMatchObject({ valid: false })
  })

  it.each([
    ['default', true],
    ['dev.xrugc.com', true],
    ['Dev.xrugc.com', false],
    ['https://dev.xrugc.com', false],
    ['dev..xrugc.com', false],
  ])('validates external key %s', (value, valid) => {
    expect(isValidDomainConfigKey(value)).toBe(valid)
  })

  it('formats and compacts without changing data', () => {
    expect(formatJsonObjectText('{"name":"主站","a":1}')).toBe('{\n  "name": "主站",\n  "a": 1\n}')
    expect(formatJsonObjectText('{ "name": "主站" }', true)).toBe('{"name":"主站"}')
    expect(formatJsonObjectText('[]')).toBeNull()
  })
})
