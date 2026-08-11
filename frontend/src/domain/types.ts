export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export type WhiteLabelSchemaVersion = 1

/** Editable white-label content. Identity is stored separately as configKey. */
export interface DomainConfigContent extends JsonObject {
  description: string
  is_active: boolean
  fallback_domain: string | null
  default_config: JsonObject
  configs: { [locale: string]: JsonObject }
}

/** Source/public contract compatible with web/public/config/domains/*.json. */
export interface StaticDomainConfig extends DomainConfigContent {
  name: string
}

export interface DomainImportCatalogItem {
  configKey: string
  description: string
  isActive: boolean
  importable: boolean
  materializedFrom: string[]
  warnings: string[]
  reason?: string
  config?: DomainConfigContent
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
  config: DomainConfigContent
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CreateDomainConfigInput {
  configKey: string
  schemaVersion: WhiteLabelSchemaVersion
  config: DomainConfigContent
}

export interface UpdateDomainConfigInput {
  schemaVersion: WhiteLabelSchemaVersion
  config: DomainConfigContent
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
