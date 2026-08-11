import { backendApi } from './client'
import type {
  CreateDomainConfigInput,
  DomainImportCatalog,
  DomainImportCatalogItem,
  DomainConfigRecord,
  JsonObject,
  ListQuery,
  PagedResult,
  UpdateDomainConfigInput,
} from '../domain/types'

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

export function normalizeDomainConfig(value: unknown): DomainConfigRecord {
  const raw = asRecord(value)
  const rawConfig = jsonObject(raw.config)
  const configKey = stringValue(
    raw.configKey,
    raw.domainConfigKey,
    raw.domain,
  )
  return {
    domainId: numberValue(raw.domainId),
    configKey,
    description: stringValue(
      raw.description,
      raw.domainDescription,
      raw.displayName,
      configKey,
    ),
    schemaVersion: numberValue(raw.schemaVersion),
    revision: numberValue(raw.revision),
    config: rawConfig,
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

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
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
  const selectable = catalogBoolean(raw.selectable, `${path}.selectable`)
  const hasReason = hasOwn(raw, 'reason')
  const reason = hasReason
    ? catalogString(raw.reason, `${path}.reason`)
    : undefined
  if (!selectable && (!reason || reason.trim() === '')) {
    throw catalogContractError(
      `${path}.reason`,
      'must be a non-empty string when selectable is false',
    )
  }

  return {
    configKey,
    description,
    isActive,
    selectable,
    ...(reason !== undefined ? { reason } : {}),
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
