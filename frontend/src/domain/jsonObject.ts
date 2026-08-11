import type { JsonObject } from './types'

export type JsonValidationIssueCode =
  | 'syntax'
  | 'object-required'
  | 'security'

export interface JsonValidationIssue {
  code: JsonValidationIssueCode
  message: string
  path: string
}

export type JsonValidationResult<T extends JsonObject = JsonObject> =
  | { valid: true; value: T; issues: [] }
  | { valid: false; value: null; issues: JsonValidationIssue[] }

export const DOMAIN_CONFIG_KEY_PATTERN =
  '^(?:default|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$'

export const JSON_SECURITY_LIMITS = Object.freeze({
  maxBytes: 64 * 1024,
  maxDepth: 12,
  maxNodes: 5_000,
  maxStringLength: 16_384,
  maxArrayLength: 1_000,
  maxFieldNameLength: 128,
})

const JSON_FIELD_NAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/
const FORBIDDEN_KEY_NAMES = new Set([
  'auth', 'authorization', 'bearer', 'jwt', 'oauth', 'proto', 'prototype',
  'constructor', 'dsn',
])
const SENSITIVE_KEY_FRAGMENTS = [
  'secret', 'password', 'token', 'credential', 'apikey', 'privatekey',
  'signingkey', 'databaseurl', 'connectionstring',
]

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedFieldName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '').replace(/_/g, '').toLowerCase()
}

function isForbiddenFieldName(value: string): boolean {
  const normalized = normalizedFieldName(value)
  return FORBIDDEN_KEY_NAMES.has(normalized)
    || SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

function pointer(path: readonly (string | number)[]): string {
  if (path.length === 0) return '/'
  return `/${path.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`
}

function securityIssue(
  path: readonly (string | number)[],
  message: string,
): JsonValidationIssue {
  return { code: 'security', message, path: pointer(path) }
}

function inspectJson(
  value: unknown,
  path: readonly (string | number)[],
  state: { nodes: number },
): JsonValidationIssue | null {
  state.nodes += 1
  if (state.nodes > JSON_SECURITY_LIMITS.maxNodes) {
    return securityIssue(path, `config may contain at most ${JSON_SECURITY_LIMITS.maxNodes} JSON values`)
  }
  if (path.length > JSON_SECURITY_LIMITS.maxDepth) {
    return securityIssue(path, `config may be nested at most ${JSON_SECURITY_LIMITS.maxDepth} levels`)
  }
  if (typeof value === 'string') {
    return value.length > JSON_SECURITY_LIMITS.maxStringLength
      ? securityIssue(path, `config strings may contain at most ${JSON_SECURITY_LIMITS.maxStringLength} characters`)
      : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : securityIssue(path, 'config numbers must be finite')
  }
  if (value === null || typeof value === 'boolean') return null
  if (Array.isArray(value)) {
    if (value.length > JSON_SECURITY_LIMITS.maxArrayLength) {
      return securityIssue(path, `config arrays may contain at most ${JSON_SECURITY_LIMITS.maxArrayLength} values`)
    }
    for (let index = 0; index < value.length; index += 1) {
      const issue = inspectJson(value[index], [...path, index], state)
      if (issue) return issue
    }
    return null
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!JSON_FIELD_NAME_PATTERN.test(key)) {
        return securityIssue([...path, key], `config field "${key}" must use ASCII letters, digits, dot, underscore, or hyphen`)
      }
      if (isForbiddenFieldName(key)) {
        return securityIssue([...path, key], `config field "${key}" is forbidden; secrets must not be stored here`)
      }
      const issue = inspectJson(child, [...path, key], state)
      if (issue) return issue
    }
    return null
  }
  return securityIssue(path, 'config must contain only serializable JSON values')
}

export function validateJsonObjectValue(value: unknown): JsonValidationResult {
  if (!isJsonObject(value)) {
    return {
      valid: false,
      value: null,
      issues: [{ code: 'object-required', message: 'The JSON value must be an object', path: '/' }],
    }
  }
  const issue = inspectJson(value, [], { nodes: 0 })
  if (issue) return { valid: false, value: null, issues: [issue] }
  let serialized = ''
  try {
    serialized = JSON.stringify(value) ?? ''
  } catch {
    return { valid: false, value: null, issues: [securityIssue([], 'config must be serializable JSON')] }
  }
  if (new TextEncoder().encode(serialized).byteLength > JSON_SECURITY_LIMITS.maxBytes) {
    return {
      valid: false,
      value: null,
      issues: [securityIssue([], `config JSON may be at most ${JSON_SECURITY_LIMITS.maxBytes} bytes`)],
    }
  }
  return { valid: true, value, issues: [] }
}

export function validateJsonObjectText(text: string): JsonValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    return {
      valid: false,
      value: null,
      issues: [{
        code: 'syntax',
        message: error instanceof Error ? error.message : 'Invalid JSON syntax',
        path: '/',
      }],
    }
  }
  return validateJsonObjectValue(parsed)
}

export function formatJsonObjectText(text: string, compact = false): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return null
  }
  const secured = validateJsonObjectValue(parsed)
  return secured.valid ? JSON.stringify(secured.value, null, compact ? 0 : 2) : null
}

export function isValidDomainConfigKey(value: string): boolean {
  return value.length <= 253 && new RegExp(DOMAIN_CONFIG_KEY_PATTERN).test(value)
}
