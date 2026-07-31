export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

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
  domain: string
  displayName: string
  schemaVersion: number
  revision: number
  config: JsonObject
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
  domain: string
  domainDisplayName: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateOrganizationConfigInput {
  organizationId: number
  schemaVersion: 1
  config: JsonObject
}

export interface UpdateOrganizationConfigInput {
  revision: number
  schemaVersion: number
  config: JsonObject
}

export interface CreateDomainConfigInput {
  domain: string
  displayName: string
  schemaVersion: 1
  config: JsonObject
}

export interface UpdateDomainConfigInput {
  domain: string
  displayName: string
  schemaVersion: number
  config: JsonObject
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
