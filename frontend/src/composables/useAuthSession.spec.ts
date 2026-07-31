import { describe, expect, it } from 'vitest'
import {
  canManageOrganization,
  hasRootOrAdminRole,
} from './useAuthSession'

describe('white-label role policy', () => {
  it.each([
    [['root'], true],
    [['admin'], true],
    [['user', 'admin'], true],
    [['manager'], false],
    [['administrator'], false],
    [['Admin'], false],
    [[], false],
  ])('checks exact root/admin membership for %j', (roles, expected) => {
    expect(hasRootOrAdminRole(roles as string[])).toBe(expected)
  })

  it('lets root manage every organization', () => {
    expect(
      canManageOrganization(
        { roles: ['root'], organizations: [] },
        999,
      ),
    ).toBe(true)
  })

  it('limits admin writes to organization IDs returned by verify-token', () => {
    const admin = {
      roles: ['admin'],
      organizations: [
        { id: 12 },
        { id: 42 },
      ],
    }

    expect(canManageOrganization(admin, 42)).toBe(true)
    expect(canManageOrganization(admin, 8)).toBe(false)
  })

  it('does not grant organization writes to manager or user roles', () => {
    expect(
      canManageOrganization(
        { roles: ['manager'], organizations: [{ id: 42 }] },
        42,
      ),
    ).toBe(false)
  })
})
