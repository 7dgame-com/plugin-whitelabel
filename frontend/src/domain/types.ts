export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export type WhiteLabelSchemaVersion = 1

/** Same top-level contract as web/public/config/domains/*.json. */
export interface StaticDomainConfig extends JsonObject {
  name: string
  description: string
  is_active: boolean
  fallback_domain: string | null
  default_config: JsonObject
  configs: { [locale: string]: JsonObject }
}

export interface OrganizationSummary {
  id: number
  name: string
  title: string
}

export interface OrganizationConfigRecord {
  organizationId: number
  organizationName: string
  organizationTitle: string
  schemaVersion: number
  revision: number
  config: JsonObject
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface DomainConfigRecord {
  domainId: number
  configKey: string
  description: string
  schemaVersion: number
  revision: number
  config: StaticDomainConfig
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AssignmentRecord {
  assignmentId: number
  organizationId: number
  domainId: number
  revision: number
  enabled: boolean
  organizationEnabled: boolean
  domainEnabled: boolean
  qrUrl: string | null
  organizationName: string
  organizationTitle: string
  domainConfigKey: string
  domainDescription: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateOrganizationConfigInput {
  organizationId: number
  schemaVersion: WhiteLabelSchemaVersion
  config: JsonObject
}

export interface UpdateOrganizationConfigInput {
  revision: number
  schemaVersion: WhiteLabelSchemaVersion
  config: JsonObject
}

export interface CreateDomainConfigInput {
  configKey: string
  schemaVersion: WhiteLabelSchemaVersion
  config: StaticDomainConfig
}

export interface UpdateDomainConfigInput {
  configKey: string
  schemaVersion: WhiteLabelSchemaVersion
  config: StaticDomainConfig
  revision: number
}

export interface AssignmentInput {
  organizationId: number
  domainId: number
}

export interface ListQuery {
  q?: string
  page?: number
  pageSize?: number
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
