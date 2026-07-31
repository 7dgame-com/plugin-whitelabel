import { backendApi } from './client'
import type {
  AssignmentInput,
  AssignmentRecord,
  CreateDomainConfigInput,
  CreateOrganizationConfigInput,
  DomainConfigRecord,
  JsonObject,
  ListQuery,
  OrganizationConfigRecord,
  PagedResult,
  StaticDomainConfig,
  UpdateDomainConfigInput,
  UpdateOrganizationConfigInput,
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
    raw.configKey,
    raw.domainConfigKey,
    raw.domain,
    config.name,
  )
  return {
    domainId: numberValue(raw.domainId),
    configKey,
    description: stringValue(
      raw.description,
      raw.domainDescription,
      raw.displayName,
      config.description,
      configKey,
    ),
    schemaVersion: numberValue(raw.schemaVersion),
    revision: numberValue(raw.revision),
    config: config as StaticDomainConfig,
    enabled: booleanValue(raw.enabled),
    ...timestamps(raw),
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
