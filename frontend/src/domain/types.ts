export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export type WhiteLabelSchemaVersion = 1

export interface DomainImportCatalogItem {
  configKey: string
  description: string
  isActive: boolean
  selectable: boolean
  reason?: string
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
  config: JsonObject
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CreateDomainConfigInput {
  configKey: string
  schemaVersion: WhiteLabelSchemaVersion
  config: JsonObject
}

export interface UpdateDomainConfigInput {
  schemaVersion: WhiteLabelSchemaVersion
  config: JsonObject
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
