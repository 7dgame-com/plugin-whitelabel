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

export interface DomainImportCatalogItem {
  configKey: string
  description: string
  isActive: boolean
  importable: boolean
  materializedFrom: string[]
  warnings: string[]
  reason?: string
  config?: StaticDomainConfig
}

export interface DomainImportCatalog {
  source: string
  items: DomainImportCatalogItem[]
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
