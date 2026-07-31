import Ajv, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv'
import type { JsonObject, StaticDomainConfig } from './types'

export type JsonSchemaKind = 'organization' | 'domain'

export type JsonValidationIssueCode =
  | 'syntax'
  | 'object-required'
  | 'security'
  | 'schema'

export interface JsonValidationIssue {
  code: JsonValidationIssueCode
  message: string
  path: string
}

export type JsonValidationResult<T extends JsonObject = JsonObject> =
  | { valid: true; value: T; issues: [] }
  | { valid: false; value: null; issues: JsonValidationIssue[] }

/**
 * Main-frontend domain configuration keys are lower-case, DNS-safe keys.
 * `default` is also a first-class key used by the static configuration loader.
 */
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

const JSON_FIELD_NAME_PATTERN =
  /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/

const FORBIDDEN_KEY_NAMES = new Set([
  'auth',
  'authorization',
  'bearer',
  'jwt',
  'oauth',
  'proto',
  'prototype',
  'constructor',
  'dsn',
])

const SENSITIVE_KEY_FRAGMENTS = [
  'secret',
  'password',
  'token',
  'credential',
  'apikey',
  'privatekey',
  'signingkey',
  'databaseurl',
  'connectionstring',
]

const organizationSchema = {
  type: 'object',
  additionalProperties: true,
} as const

/**
 * Mirrors web/public/config/domains/*.json. Nested payloads deliberately stay
 * open so the plugin does not take ownership of the main frontend's settings.
 */
const domainSchema = {
  type: 'object',
  required: [
    'name',
    'description',
    'is_active',
    'fallback_domain',
    'default_config',
    'configs',
  ],
  properties: {
    name: {
      type: 'string',
      maxLength: 253,
      pattern: DOMAIN_CONFIG_KEY_PATTERN,
    },
    description: { type: 'string', maxLength: 191 },
    is_active: { type: 'boolean' },
    fallback_domain: {
      anyOf: [
        { type: 'null' },
        {
          type: 'string',
          maxLength: 253,
          pattern: DOMAIN_CONFIG_KEY_PATTERN,
        },
      ],
    },
    default_config: {
      type: 'object',
      additionalProperties: true,
    },
    configs: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
} as const

const ajv = new Ajv({ allErrors: true, strict: true })
const validators: Record<JsonSchemaKind, ValidateFunction> = {
  organization: ajv.compile(organizationSchema),
  domain: ajv.compile(domainSchema),
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedFieldName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_/g, '')
    .toLowerCase()
}

function isForbiddenFieldName(value: string): boolean {
  const normalized = normalizedFieldName(value)
  return (
    FORBIDDEN_KEY_NAMES.has(normalized) ||
    SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
      normalized.includes(fragment),
    )
  )
}

function pointer(path: readonly (string | number)[]): string {
  if (path.length === 0) return '/'
  return `/${path
    .map((part) =>
      String(part).replace(/~/g, '~0').replace(/\//g, '~1'),
    )
    .join('/')}`
}

function securityIssue(
  path: readonly (string | number)[],
  message: string,
): JsonValidationIssue {
  return {
    code: 'security',
    message,
    path: pointer(path),
  }
}

/** Mirrors backend rawConfigSecuritySchema.inspectJson exactly. */
function inspectJsonStructure(
  value: unknown,
  path: readonly (string | number)[],
  state: { nodes: number },
): JsonValidationIssue | null {
  state.nodes += 1
  if (state.nodes > JSON_SECURITY_LIMITS.maxNodes) {
    return securityIssue(
      path,
      `config may contain at most ${JSON_SECURITY_LIMITS.maxNodes} JSON values`,
    )
  }
  if (path.length > JSON_SECURITY_LIMITS.maxDepth) {
    return securityIssue(
      path,
      `config may be nested at most ${JSON_SECURITY_LIMITS.maxDepth} levels`,
    )
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = inspectJsonStructure(value[index], [...path, index], state)
      if (issue) return issue
    }
    return null
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!JSON_FIELD_NAME_PATTERN.test(key)) {
        return securityIssue(
          [...path, key],
          `config field "${key}" must use ASCII letters, digits, dot, underscore, or hyphen`,
        )
      }
      if (isForbiddenFieldName(key)) {
        return securityIssue(
          [...path, key],
          `config field "${key}" is forbidden; secrets must not be stored here`,
        )
      }
      const issue = inspectJsonStructure(child, [...path, key], state)
      if (issue) return issue
    }
  }

  return null
}

/** Mirrors the recursive jsonValueSchema limits after raw inspection. */
function inspectJsonValueLimits(
  value: unknown,
  path: readonly (string | number)[],
): JsonValidationIssue | null {
  if (typeof value === 'string') {
    return value.length > JSON_SECURITY_LIMITS.maxStringLength
      ? securityIssue(
          path,
          `config strings may contain at most ${JSON_SECURITY_LIMITS.maxStringLength} characters`,
        )
      : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? null
      : securityIssue(path, 'config numbers must be finite')
  }
  if (value === null || typeof value === 'boolean') return null

  if (Array.isArray(value)) {
    if (value.length > JSON_SECURITY_LIMITS.maxArrayLength) {
      return securityIssue(
        path,
        `config arrays may contain at most ${JSON_SECURITY_LIMITS.maxArrayLength} values`,
      )
    }
    for (let index = 0; index < value.length; index += 1) {
      const issue = inspectJsonValueLimits(value[index], [...path, index])
      if (issue) return issue
    }
    return null
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const issue = inspectJsonValueLimits(child, [...path, key])
      if (issue) return issue
    }
    return null
  }

  return securityIssue(path, 'config must contain only serializable JSON values')
}

function inspectJsonSecurity(value: JsonObject): JsonValidationIssue[] {
  const issues: JsonValidationIssue[] = []
  const structureIssue = inspectJsonStructure(value, [], { nodes: 0 })
  if (structureIssue) issues.push(structureIssue)

  let serialized = ''
  try {
    serialized = JSON.stringify(value) ?? ''
  } catch {
    issues.push(securityIssue([], 'config must be serializable JSON'))
    return issues
  }

  if (
    new TextEncoder().encode(serialized).byteLength >
    JSON_SECURITY_LIMITS.maxBytes
  ) {
    issues.push(
      securityIssue(
        [],
        `config JSON may be at most ${JSON_SECURITY_LIMITS.maxBytes} bytes`,
      ),
    )
  }

  if (issues.length === 0) {
    const valueIssue = inspectJsonValueLimits(value, [])
    if (valueIssue) issues.push(valueIssue)
  }
  return issues
}

function issuePath(error: ErrorObject): string {
  if (error.keyword === 'required') {
    const property = String(error.params.missingProperty ?? '')
    return `${error.instancePath}/${property}` || '/'
  }
  return error.instancePath || '/'
}

function issueMessage(error: ErrorObject): string {
  const path = issuePath(error)
  if (error.keyword === 'required') {
    return `${path} is required`
  }
  if (error.keyword === 'pattern') {
    return `${path} must be a lower-case configuration key such as dev.xrugc.com`
  }
  return `${path} ${error.message ?? 'does not match the schema'}`
}

export function validateJsonObjectValue<T extends JsonObject = JsonObject>(
  value: unknown,
  schema: JsonSchemaKind,
): JsonValidationResult<T> {
  if (!isJsonObject(value)) {
    return {
      valid: false,
      value: null,
      issues: [
        {
          code: 'object-required',
          message: 'The JSON value must be an object',
          path: '/',
        },
      ],
    }
  }

  const securityIssues = inspectJsonSecurity(value)
  if (securityIssues.length > 0) {
    return {
      valid: false,
      value: null,
      issues: securityIssues,
    }
  }

  const validator = validators[schema]
  if (!validator(value)) {
    return {
      valid: false,
      value: null,
      issues: (validator.errors ?? []).map((error) => ({
        code: 'schema' as const,
        message: issueMessage(error),
        path: issuePath(error),
      })),
    }
  }

  if (schema === 'domain') {
    const config = value as StaticDomainConfig
    const domainIssues: JsonValidationIssue[] = []
    if (
      config.description.trim() === '' &&
      config.name.length > 191
    ) {
      domainIssues.push({
        code: 'schema',
        message:
          'description is required when config.name exceeds 191 characters',
        path: '/description',
      })
    }

    const hasDefaultConfig = Object.keys(config.default_config).length > 0
    const hasLocalizedConfig = Object.values(config.configs).some(
      (localizedConfig) => Object.keys(localizedConfig).length > 0,
    )
    if (
      config.fallback_domain !== null &&
      config.fallback_domain !== config.name &&
      !hasDefaultConfig &&
      !hasLocalizedConfig
    ) {
      domainIssues.push({
        code: 'schema',
        message:
          'an external fallback requires local default_config or configs data; Unity snapshots must be self-contained',
        path: '/fallback_domain',
      })
    }

    if (domainIssues.length > 0) {
      return {
        valid: false,
        value: null,
        issues: domainIssues,
      }
    }
  }

  return { valid: true, value: value as T, issues: [] }
}

export function validateJsonObjectText(
  text: string,
  schema: 'domain',
): JsonValidationResult<StaticDomainConfig>
export function validateJsonObjectText(
  text: string,
  schema: 'organization',
): JsonValidationResult<JsonObject>
export function validateJsonObjectText(
  text: string,
  schema: JsonSchemaKind,
): JsonValidationResult
export function validateJsonObjectText(
  text: string,
  schema: JsonSchemaKind,
): JsonValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    return {
      valid: false,
      value: null,
      issues: [
        {
          code: 'syntax',
          message:
            error instanceof Error ? error.message : 'Invalid JSON syntax',
          path: '/',
        },
      ],
    }
  }

  return validateJsonObjectValue(parsed, schema)
}

export function formatJsonObjectText(
  text: string,
  compact = false,
): string | null {
  const parsed = validateJsonObjectText(text, 'organization')
  return parsed.valid
    ? JSON.stringify(parsed.value, null, compact ? 0 : 2)
    : null
}

export function isValidDomainConfigKey(value: string): boolean {
  return (
    value.length <= 253 &&
    new RegExp(DOMAIN_CONFIG_KEY_PATTERN).test(value)
  )
}
