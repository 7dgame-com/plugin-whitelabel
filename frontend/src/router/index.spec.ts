import { beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  hasAdminAccess: { value: false },
  isAuthenticated: { value: true },
}))

vi.mock('../composables/useAuthSession', () => ({
  useAuthSession: () => session,
}))

vi.mock('../utils/hostEvents', () => ({
  notifyHostPluginUrlChanged: vi.fn(),
}))

import { adminOnlyGuard } from './index'

describe('admin-only route guard', () => {
  beforeEach(() => {
    session.fetchSession.mockReset().mockResolvedValue(undefined)
    session.hasAdminAccess.value = false
    session.isAuthenticated.value = true
  })

  it('allows a verified root/admin session', async () => {
    session.hasAdminAccess.value = true
    await expect(
      adminOnlyGuard({
        fullPath: '/configs',
        meta: { requiresAdmin: true },
      } as never),
    ).resolves.toBe(true)
  })

  it('denies authenticated non-admin sessions', async () => {
    await expect(
      adminOnlyGuard({
        fullPath: '/configs',
        meta: { requiresAdmin: true },
      } as never),
    ).resolves.toEqual({
      name: 'NotAllowed',
      query: { reason: 'role' },
    })
  })

  it('fails closed when session verification fails', async () => {
    session.fetchSession.mockRejectedValue(new Error('unavailable'))
    await expect(
      adminOnlyGuard({
        fullPath: '/configs',
        meta: { requiresAdmin: true },
      } as never),
    ).resolves.toEqual({
      name: 'NotAllowed',
      query: { reason: 'session' },
    })
  })
})
