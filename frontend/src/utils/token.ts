const LEGACY_TOKEN_KEY = 'plugin-whitelabel-token'
const LEGACY_REFRESH_TOKEN_KEY = 'plugin-whitelabel-refresh-token'

// Authentication belongs to the current iframe handshake. Keeping it only in
// memory prevents a reload, host logout, or account switch from silently
// reusing a previously persisted root/admin session.
let accessToken: string | null = null
let refreshToken: string | null = null

try {
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY)
} catch {
  // Storage can be unavailable in sandboxed iframes. It is not required.
}

export function isInIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function getToken(): string | null {
  return accessToken
}

export function setToken(token: string): void {
  accessToken = token
}

export function removeToken(): void {
  accessToken = null
}

export function getRefreshToken(): string | null {
  return refreshToken
}

export function setRefreshToken(token: string): void {
  refreshToken = token
}

export function removeAllTokens(): void {
  accessToken = null
  refreshToken = null
}

function messageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function notifyParentTokenExpired(): void {
  if (!isInIframe()) return

  window.parent.postMessage(
    {
      type: 'TOKEN_EXPIRED',
      id: messageId('token-expired'),
    },
    '*',
  )
}

export function requestParentTokenRefresh(
  timeoutMs = Number(import.meta.env.VITE_IFRAME_REFRESH_TIMEOUT) || 3000,
): Promise<string | null> {
  if (!isInIframe()) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false

    const finish = (token: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener('message', handleMessage)
      resolve(token)
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const message = event.data as {
        type?: string
        payload?: { token?: unknown }
      }

      if (message?.type !== 'TOKEN_UPDATE') return
      const token =
        typeof message.payload?.token === 'string' && message.payload.token
          ? message.payload.token
          : null
      if (token) setToken(token)
      finish(token)
    }

    const timer = window.setTimeout(() => finish(null), timeoutMs)
    window.addEventListener('message', handleMessage)
    window.parent.postMessage(
      {
        type: 'TOKEN_REFRESH_REQUEST',
        id: messageId('token-refresh-request'),
      },
      '*',
    )
  })
}
