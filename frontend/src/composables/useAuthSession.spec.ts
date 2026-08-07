import { describe, expect, it } from 'vitest'
import { hasRootOrAdminRole } from './useAuthSession'

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
})
