import { backendApi } from './client'
import type {
  AssignmentInput,
  AssignmentRecord,
  CreateDomainConfigInput,
  CreateOrganizationConfigInput,
  DomainImportCatalog,
  DomainImportCatalogItem,
  DomainConfigRecord,
  JsonObject,
  ListQuery,
  OrganizationConfigRecord,
  PagedResult,
  StaticDomainConfig,
  UpdateDomainConfigInput,
  UpdateOrganizationConfigInput,
} from '../domain/types'
import { validateJsonObjectValue } from '../domain/jsonObject'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {}
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value)
  return 'data' in record ? record.data : value
}

function stringValue(...values: unknown[]): string {
  const value = values.find((candidate) => typeof candidate === 'string')
  return typeof value === 'string' ? value : ''
}

function numberValue(...values: unknown[]): number {
  const value = values.find(
    (candidate) =>
      typeof candidate === 'number' ||
      (typeof candidate === 'string' && candidate.trim() !== ''),
  )
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1
}

function jsonObject(value: unknown): JsonObject {
  return asRecord(value) as JsonObject
}

function timestamps(raw: UnknownRecord) {
  const createdAt = stringValue(raw.createdAt)
  const updatedAt = stringValue(raw.updatedAt)
  return {
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

export function normalizeOrganizationConfig(
  value: unknown,
): OrganizationConfigRecord {
  const raw = asRecord(value)
  return {
    organizationId: numberValue(raw.organizationId),
    organizationName: stringValue(raw.organizationName),
    organizationTitle: stringValue(
      raw.organizationTitle,
      raw.organizationName,
    ),
    schemaVersion: numberValue(raw.schemaVersion),
    revision: numberValue(raw.revision),
    config: jsonObject(raw.config),
    enabled: booleanValue(raw.enabled),
    ...timestamps(raw),
  }
}

export function normalizeDomainConfig(value: unknown): DomainConfigRecord {
  const raw = asRecord(value)
  const config = jsonObject(raw.config)
  const configKey = stringValue(
    config.name,
    raw.configKey,
    raw.domainConfigKey,
    raw.domain,
  )
  return {
    domainId: numberValue(raw.domainId),
    configKey,
    description: stringValue(
      config.description,
      raw.description,
      raw.domainDescription,
      raw.displayName,
      configKey,
    ),
    schemaVersion: numberValue(raw.schemaVersion),
    revision: numberValue(raw.revision),
    config: config as StaticDomainConfig,
    enabled: booleanValue(raw.enabled),
    ...timestamps(raw),
  }
}

function catalogContractError(path: string, requirement: string): TypeError {
  return new TypeError(
    `Invalid domain import catalog: ${path} ${requirement}`,
  )
}

function catalogRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw catalogContractError(path, 'must be an object')
  }
  return value as UnknownRecord
}

function catalogString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw catalogContractError(path, 'must be a string')
  }
  return value
}

function catalogBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw catalogContractError(path, 'must be a boolean')
  }
  return value
}

function catalogStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw catalogContractError(path, 'must be an array of strings')
  }
  const invalidIndex = value.findIndex((item) => typeof item !== 'string')
  if (invalidIndex >= 0) {
    throw catalogContractError(
      `${path}[${invalidIndex}]`,
      'must be a string',
    )
  }
  return value as string[]
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function catalogDomainConfig(
  value: unknown,
  path: string,
): StaticDomainConfig {
  const result = validateJsonObjectValue<StaticDomainConfig>(value, 'domain')
  if (!result.valid) {
    const details = result.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')
    throw catalogContractError(
      path,
      `must be a valid StaticDomainConfig (${details})`,
    )
  }
  return result.value
}

export function normalizeDomainImportCatalogItem(
  value: unknown,
  path = 'item',
): DomainImportCatalogItem {
  const raw = catalogRecord(value, path)
  const configKey = catalogString(raw.configKey, `${path}.configKey`)
  const description = catalogString(
    raw.description,
    `${path}.description`,
  )
  const isActive = catalogBoolean(raw.isActive, `${path}.isActive`)
  const importable = catalogBoolean(
    raw.importable,
    `${path}.importable`,
  )
  const materializedFrom = catalogStringArray(
    raw.materializedFrom,
    `${path}.materializedFrom`,
  )
  const warnings = catalogStringArray(raw.warnings, `${path}.warnings`)
  const hasReason = hasOwn(raw, 'reason')
  const reason = hasReason
    ? catalogString(raw.reason, `${path}.reason`)
    : undefined
  const hasConfig = hasOwn(raw, 'config')
  const config = hasConfig
    ? catalogDomainConfig(raw.config, `${path}.config`)
    : undefined

  if (!importable && (!reason || reason.trim() === '')) {
    throw catalogContractError(
      `${path}.reason`,
      'must be a non-empty string when importable is false',
    )
  }
  if (importable && !config) {
    throw catalogContractError(
      `${path}.config`,
      'is required when importable is true',
    )
  }
  if (importable && config) {
    if (config.name !== configKey) {
      throw catalogContractError(
        `${path}.config.name`,
        'must exactly match configKey',
      )
    }
    if (config.description !== description) {
      throw catalogContractError(
        `${path}.config.description`,
        'must exactly match description',
      )
    }
    if (config.is_active !== isActive) {
      throw catalogContractError(
        `${path}.config.is_active`,
        'must exactly match isActive',
      )
    }
  }

  return {
    configKey,
    description,
    isActive,
    importable,
    materializedFrom,
    warnings,
    ...(reason !== undefined ? { reason } : {}),
    ...(config !== undefined ? { config } : {}),
  }
}

export function normalizeDomainImportCatalog(
  value: unknown,
): DomainImportCatalog {
  const raw = catalogRecord(unwrapData(value), 'catalog')
  const source = catalogString(raw.source, 'catalog.source')
  if (!Array.isArray(raw.items)) {
    throw catalogContractError('catalog.items', 'must be an array')
  }
  if (raw.items.length === 0) {
    throw catalogContractError(
      'catalog.items',
      'must contain at least one item',
    )
  }
  return {
    source,
    items: raw.items.map((item, index) =>
      normalizeDomainImportCatalogItem(item, `catalog.items[${index}]`),
    ),
  }
}

export function normalizeAssignment(value: unknown): AssignmentRecord {
  const raw = asRecord(value)
  const organization = asRecord(raw.organization)
  const domain =
    typeof raw.domain === 'object' ? asRecord(raw.domain) : {}

  return {
    assignmentId: numberValue(raw.assignmentId),
    organizationId: numberValue(
      raw.organizationId,
      organization.organizationId,
      organization.id,
    ),
    domainId: numberValue(raw.domainId, domain.domainId, domain.id),
    revision: numberValue(raw.revision),
    enabled: booleanValue(raw.enabled),
    organizationEnabled: booleanValue(organization.enabled),
    domainEnabled: booleanValue(domain.enabled),
    qrUrl: stringValue(raw.qrUrl) || null,
    organizationName: stringValue(
      raw.organizationName,
      organization.organizationName,
      organization.name,
    ),
    organizationTitle: stringValue(
      raw.organizationTitle,
      organization.organizationTitle,
      organization.title,
      raw.organizationName,
    ),
    domainConfigKey: stringValue(
      raw.domainConfigKey,
      typeof raw.domain === 'string' ? raw.domain : undefined,
      domain.configKey,
      domain.domainConfigKey,
      domain.domain,
      domain.host,
    ),
    domainDescription: stringValue(
      raw.domainDescription,
      raw.domainDisplayName,
      domain.description,
      domain.domainDescription,
      domain.displayName,
      typeof raw.domain === 'string' ? raw.domain : undefined,
      domain.configKey,
      domain.domain,
    ),
    ...timestamps(raw),
  }
}

function listParams(query: ListQuery): Record<string, unknown> {
  return {
    q: query.q || undefined,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  }
}

function normalizePage<T>(
  value: unknown,
  query: ListQuery,
  normalize: (item: unknown) => T,
): PagedResult<T> {
  const payload = unwrapData(value)
  if (Array.isArray(payload)) {
    return {
      items: payload.map(normalize),
      total: payload.length,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    }
  }

  const page = asRecord(payload)
  const items = Array.isArray(page.items) ? page.items : []
  return {
    items: items.map(normalize),
    total: numberValue(page.total, items.length),
    page: numberValue(page.page, query.page ?? 1),
    pageSize: numberValue(page.pageSize, query.pageSize ?? 20),
  }
}

async function setEnabled<T>(
  resource: string,
  id: number,
  enabled: boolean,
  revision: number,
  normalize: (value: unknown) => T,
): Promise<T> {
  const action = enabled ? 'enable' : 'disable'
  const response = await backendApi.post(
    `/${resource}/${encodeURIComponent(String(id))}/${action}`,
    { revision },
  )
  return normalize(unwrapData(response.data))
}

export async function listOrganizationConfigs(
  query: ListQuery = {},
): Promise<PagedResult<OrganizationConfigRecord>> {
  const response = await backendApi.get('/organization-configs', {
    params: listParams(query),
  })
  return normalizePage(response.data, query, normalizeOrganizationConfig)
}

export async function createOrganizationConfig(
  input: CreateOrganizationConfigInput,
): Promise<OrganizationConfigRecord> {
  const response = await backendApi.post('/organization-configs', input)
  return normalizeOrganizationConfig(unwrapData(response.data))
}

export async function getOrganizationConfig(
  organizationId: number,
): Promise<OrganizationConfigRecord> {
  const response = await backendApi.get(
    `/organization-configs/${organizationId}`,
  )
  return normalizeOrganizationConfig(unwrapData(response.data))
}

export async function updateOrganizationConfig(
  organizationId: number,
  input: UpdateOrganizationConfigInput,
): Promise<OrganizationConfigRecord> {
  const response = await backendApi.put(
    `/organization-configs/${organizationId}`,
    input,
  )
  return normalizeOrganizationConfig(unwrapData(response.data))
}

export function setOrganizationConfigEnabled(
  organizationId: number,
  enabled: boolean,
  revision: number,
): Promise<OrganizationConfigRecord> {
  return setEnabled(
    'organization-configs',
    organizationId,
    enabled,
    revision,
    normalizeOrganizationConfig,
  )
}

export async function listDomainConfigs(
  query: ListQuery = {},
): Promise<PagedResult<DomainConfigRecord>> {
  const response = await backendApi.get('/domain-configs', {
    params: listParams(query),
  })
  return normalizePage(response.data, query, normalizeDomainConfig)
}

export async function getDomainImportCatalog(): Promise<DomainImportCatalog> {
  const response = await backendApi.get('/domain-import-catalog')
  return normalizeDomainImportCatalog(response.data)
}

export async function createDomainConfig(
  input: CreateDomainConfigInput,
): Promise<DomainConfigRecord> {
  const response = await backendApi.post('/domain-configs', input)
  return normalizeDomainConfig(unwrapData(response.data))
}

export async function getDomainConfig(
  domainId: number,
): Promise<DomainConfigRecord> {
  const response = await backendApi.get(`/domain-configs/${domainId}`)
  return normalizeDomainConfig(unwrapData(response.data))
}

export async function updateDomainConfig(
  domainId: number,
  input: UpdateDomainConfigInput,
): Promise<DomainConfigRecord> {
  const response = await backendApi.put(`/domain-configs/${domainId}`, input)
  return normalizeDomainConfig(unwrapData(response.data))
}

export function setDomainConfigEnabled(
  domainId: number,
  enabled: boolean,
  revision: number,
): Promise<DomainConfigRecord> {
  return setEnabled(
    'domain-configs',
    domainId,
    enabled,
    revision,
    normalizeDomainConfig,
  )
}

export async function listAssignments(
  query: ListQuery = {},
): Promise<PagedResult<AssignmentRecord>> {
  const response = await backendApi.get('/assignments', {
    params: listParams(query),
  })
  return normalizePage(response.data, query, normalizeAssignment)
}

export async function createAssignment(
  input: AssignmentInput,
): Promise<AssignmentRecord> {
  const response = await backendApi.post('/assignments', input)
  return normalizeAssignment(unwrapData(response.data))
}

export function setAssignmentEnabled(
  assignmentId: number,
  enabled: boolean,
  revision: number,
): Promise<AssignmentRecord> {
  return setEnabled(
    'assignments',
    assignmentId,
    enabled,
    revision,
    normalizeAssignment,
  )
}
