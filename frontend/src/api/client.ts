import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import {
  getRefreshToken,
  getToken,
  isInIframe,
  notifyParentTokenExpired,
  removeAllTokens,
  requestParentTokenRefresh,
  setRefreshToken,
  setToken,
} from '../utils/token'

export const mainApi = axios.create({
  baseURL: '/api/v1',
  timeout: 12_000,
})

export const backendApi = axios.create({
  baseURL: '/backend/api/v1',
  timeout: 12_000,
})

let refreshPromise: Promise<string | null> | null = null
let bootstrapPromise: Promise<string | null> | null = null

function extractAccessToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const value = body as Record<string, unknown>
  const data =
    value.data && typeof value.data === 'object'
      ? (value.data as Record<string, unknown>)
      : value
  const token =
    data.token && typeof data.token === 'object'
      ? (data.token as Record<string, unknown>)
      : data
  const accessToken = token.accessToken ?? token.access_token
  return typeof accessToken === 'string' && accessToken ? accessToken : null
}

function extractRefreshToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const value = body as Record<string, unknown>
  const data =
    value.data && typeof value.data === 'object'
      ? (value.data as Record<string, unknown>)
      : value
  const token =
    data.token && typeof data.token === 'object'
      ? (data.token as Record<string, unknown>)
      : data
  const refreshToken = token.refreshToken ?? token.refresh_token
  return typeof refreshToken === 'string' && refreshToken ? refreshToken : null
}

async function refreshAccessToken(): Promise<string | null> {
  if (isInIframe()) {
    return requestParentTokenRefresh()
  }

  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const response = await axios.post('/api/v1/auth/refresh', { refreshToken })
    const accessToken = extractAccessToken(response.data)
    const nextRefreshToken = extractRefreshToken(response.data)
    if (accessToken) setToken(accessToken)
    if (nextRefreshToken) setRefreshToken(nextRefreshToken)
    return accessToken
  } catch {
    return null
  }
}

async function getRequestToken(): Promise<string | null> {
  const existing = getToken()
  if (existing) return existing
  if (!isInIframe()) return null

  if (!bootstrapPromise) {
    bootstrapPromise = requestParentTokenRefresh().finally(() => {
      bootstrapPromise = null
    })
  }

  return bootstrapPromise
}

async function getRefreshedToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

function setupInterceptors(instance: AxiosInstance): void {
  instance.interceptors.request.use(async (config) => {
    const token = await getRequestToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => {
      const refreshToken = response.headers['x-refresh-token']
      if (typeof refreshToken === 'string' && refreshToken) {
        setRefreshToken(refreshToken)
      }
      return response
    },
    async (error: AxiosError) => {
      const request = error.config as
        | (InternalAxiosRequestConfig & { _whitelabelRetry?: boolean })
        | undefined

      if (error.response?.status !== 401 || !request || request._whitelabelRetry) {
        return Promise.reject(error)
      }

      request._whitelabelRetry = true
      const token = await getRefreshedToken()
      if (!token) {
        removeAllTokens()
        notifyParentTokenExpired()
        return Promise.reject(error)
      }

      request.headers.Authorization = `Bearer ${token}`
      return instance(request)
    },
  )
}

setupInterceptors(mainApi)
setupInterceptors(backendApi)
