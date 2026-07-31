import { describe, expect, it } from 'vitest'
import { buildSessionScopeKey } from './sessionScope'

describe('buildSessionScopeKey', () => {
  it('is stable when equivalent roles and organizations arrive in another order', () => {
    expect(
      buildSessionScopeKey({
        id: 7,
        username: 'root',
        roles: ['admin', 'root'],
        organizations: [{ id: 42 }, { id: 8 }],
      }),
    ).toBe(
      buildSessionScopeKey({
        id: 7,
        username: 'root',
        roles: ['root', 'admin'],
        organizations: [{ id: 8 }, { id: 42 }],
      }),
    )
  })

  it('changes when the authorization scope changes', () => {
    const rootScope = buildSessionScopeKey({
      id: 7,
      username: 'root',
      roles: ['root'],
      organizations: [],
    })
    const adminScope = buildSessionScopeKey({
      id: 7,
      username: 'root',
      roles: ['admin'],
      organizations: [{ id: 42 }],
    })

    expect(adminScope).not.toBe(rootScope)
    expect(buildSessionScopeKey(null)).toBe('signed-out')
  })
})
