import { mainApi } from './client'

export interface SessionUser {
  id?: number
  username: string
  nickname?: string
  roles: string[]
}

function unwrapData(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return 'data' in record ? record.data : value
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
  }
}
