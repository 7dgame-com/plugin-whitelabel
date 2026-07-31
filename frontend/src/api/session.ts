import { mainApi } from './client'
import type { OrganizationSummary } from '../domain/types'

export interface SessionUser {
  id?: number
  username: string
  nickname?: string
  roles: string[]
  organizations: OrganizationSummary[]
}

function unwrapData(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return 'data' in record ? record.data : value
}

function normalizeOrganization(value: unknown): OrganizationSummary | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : name
  if (!Number.isInteger(id) || id <= 0 || !name) return null
  return { id, name, title }
}

export async function verifyCurrentToken(): Promise<SessionUser> {
  const response = await mainApi.get('/plugin/verify-token')
  const payload = unwrapData(response.data) as Record<string, unknown>
  return {
    id: Number.isInteger(Number(payload?.id)) ? Number(payload.id) : undefined,
    username: typeof payload?.username === 'string' ? payload.username : '',
    nickname:
      typeof payload?.nickname === 'string' ? payload.nickname : undefined,
    roles: Array.isArray(payload?.roles)
      ? [
          ...new Set(
            payload.roles
              .filter(
                (role): role is string => typeof role === 'string',
              )
              .map((role) => role.trim().toLowerCase())
              .filter(Boolean),
          ),
        ]
      : [],
    organizations: Array.isArray(payload?.organizations)
      ? payload.organizations
          .map(normalizeOrganization)
          .filter(
            (organization): organization is OrganizationSummary =>
              organization !== null,
          )
      : [],
  }
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const response = await mainApi.get('/organization/list')
  const payload = unwrapData(response.data)
  if (!Array.isArray(payload)) return []

  return payload
    .map(normalizeOrganization)
    .filter(
      (organization): organization is OrganizationSummary =>
        organization !== null,
    )
}
