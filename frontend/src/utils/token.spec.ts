import { beforeEach, describe, expect, it } from 'vitest'
import {
  getRefreshToken,
  getToken,
  removeAllTokens,
  removeToken,
  setRefreshToken,
  setToken,
} from './token'

describe('iframe authentication token storage', () => {
  beforeEach(() => {
    removeAllTokens()
    localStorage.clear()
  })

  it('keeps access and refresh tokens in memory only', () => {
    setToken('current-access')
    setRefreshToken('current-refresh')

    expect(getToken()).toBe('current-access')
    expect(getRefreshToken()).toBe('current-refresh')
    expect(localStorage.getItem('plugin-whitelabel-token')).toBeNull()
    expect(
      localStorage.getItem('plugin-whitelabel-refresh-token'),
    ).toBeNull()
  })

  it('clears the current iframe session without persistence', () => {
    setToken('current-access')
    setRefreshToken('current-refresh')
    removeToken()

    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBe('current-refresh')

    removeAllTokens()
    expect(getRefreshToken()).toBeNull()
  })
})
