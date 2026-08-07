import { computed, readonly, ref } from 'vue'
import {
  verifyCurrentToken,
  type SessionUser,
} from '../api/session'

const user = ref<SessionUser | null>(null)
const loaded = ref(false)
const loading = ref(false)
let request: Promise<void> | null = null
let sessionGeneration = 0
let requestSequence = 0

export function hasRootOrAdminRole(roles: readonly string[]): boolean {
  return roles.includes('root') || roles.includes('admin')
}

export function isRootRole(roles: readonly string[]): boolean {
  return roles.includes('root')
}

const isAuthenticated = computed(() => loaded.value && user.value !== null)
const hasAdminAccess = computed(
  () => user.value !== null && hasRootOrAdminRole(user.value.roles),
)
const isRootUser = computed(
  () => user.value !== null && isRootRole(user.value.roles),
)
export function invalidateAuthSession(): void {
  sessionGeneration += 1
  user.value = null
  loaded.value = false
}

export function useAuthSession() {
  async function fetchSession(force = false): Promise<void> {
    if (loaded.value && !force) return
    if (request && !force) return request

    const generation = sessionGeneration
    const sequence = ++requestSequence
    loading.value = true
    const nextRequest = (async () => {
      try {
        const verifiedUser = await verifyCurrentToken()
        if (
          generation === sessionGeneration &&
          sequence === requestSequence
        ) {
          user.value = verifiedUser
          loaded.value = true
        }
      } catch (error) {
        if (
          generation === sessionGeneration &&
          sequence === requestSequence
        ) {
          user.value = null
          loaded.value = true
        }
        throw error
      } finally {
        if (sequence === requestSequence) {
          loading.value = false
          request = null
        }
      }
    })()

    request = nextRequest
    return nextRequest
  }

  return {
    user: readonly(user),
    loaded: readonly(loaded),
    loading: readonly(loading),
    isAuthenticated,
    hasAdminAccess,
    isRootUser,
    fetchSession,
  }
}
