import { onBeforeUnmount, onMounted, ref } from 'vue'

interface StandardMessage {
  type: string
  id: string
  payload?: Record<string, unknown>
}

interface BridgeOptions {
  onInit?: (payload: { token: string; config: Record<string, unknown> }) => void
  onTokenUpdate?: (token: string) => void
  onThemeChange?: (theme: string) => void
  onLanguageChange?: (language: string) => void
  onDestroy?: () => void
}

declare global {
  interface Window {
    __WHITELABEL_PLUGIN_READY_SENT__?: boolean
  }
}

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function usePluginMessageBridge(options: BridgeOptions = {}) {
  const initialized = ref(false)
  const config = ref<Record<string, unknown>>({})

  function postMessage(type: string, payload?: Record<string, unknown>) {
    const message: StandardMessage = {
      type,
      id: createMessageId(type.toLowerCase()),
    }
    if (payload) message.payload = payload
    window.parent.postMessage(message, '*')
  }

  function handleMessage(event: MessageEvent) {
    if (event.source !== window.parent) return
    const message = event.data as Partial<StandardMessage>
    if (!message || typeof message.type !== 'string') return

    const payload = message.payload ?? {}
    switch (message.type) {
      case 'INIT': {
        const token = typeof payload.token === 'string' ? payload.token : ''
        config.value =
          payload.config && typeof payload.config === 'object'
            ? (payload.config as Record<string, unknown>)
            : {}
        initialized.value = true
        options.onInit?.({ token, config: config.value })
        break
      }
      case 'TOKEN_UPDATE':
        options.onTokenUpdate?.(
          typeof payload.token === 'string' ? payload.token : '',
        )
        break
      case 'THEME_CHANGE':
        if (typeof payload.theme === 'string') {
          options.onThemeChange?.(payload.theme)
        }
        break
      case 'LANG_CHANGE':
        if (typeof payload.lang === 'string') {
          options.onLanguageChange?.(payload.lang)
        }
        break
      case 'DESTROY':
        initialized.value = false
        config.value = {}
        options.onDestroy?.()
        break
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage)
    if (!window.__WHITELABEL_PLUGIN_READY_SENT__) {
      window.__WHITELABEL_PLUGIN_READY_SENT__ = true
      postMessage('PLUGIN_READY')
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('message', handleMessage)
  })

  return {
    initialized,
    config,
    postMessage,
  }
}
