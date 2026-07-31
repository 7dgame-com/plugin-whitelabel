import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePluginMessageBridge } from './usePluginMessageBridge'

declare global {
  interface Window {
    __WHITELABEL_PLUGIN_READY_SENT__?: boolean
  }
}

describe('plugin message bridge', () => {
  beforeEach(() => {
    delete window.__WHITELABEL_PLUGIN_READY_SENT__
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends one PLUGIN_READY message when mounted', () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage')
    const component = defineComponent({
      setup() {
        usePluginMessageBridge()
        return () => h('div')
      },
    })

    const first = mount(component)
    const second = mount(component)

    const readyCalls = postMessage.mock.calls.filter(
      ([message]) =>
        (message as { type?: string }).type === 'PLUGIN_READY',
    )
    expect(readyCalls).toHaveLength(1)

    first.unmount()
    second.unmount()
  })

  it('consumes INIT, token, theme and language messages from the host', () => {
    const onInit = vi.fn()
    const onTokenUpdate = vi.fn()
    const onThemeChange = vi.fn()
    const onLanguageChange = vi.fn()
    const component = defineComponent({
      setup() {
        usePluginMessageBridge({
          onInit,
          onTokenUpdate,
          onThemeChange,
          onLanguageChange,
        })
        return () => h('div')
      },
    })
    const wrapper = mount(component)

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'INIT',
          id: 'init-1',
          payload: { token: 'token-1', config: { theme: 'deep-space' } },
        },
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'TOKEN_UPDATE',
          id: 'token-1',
          payload: { token: 'token-2' },
        },
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'THEME_CHANGE',
          id: 'theme-1',
          payload: { theme: 'cyber-tech' },
        },
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'LANG_CHANGE',
          id: 'lang-1',
          payload: { lang: 'en-US' },
        },
      }),
    )

    expect(onInit).toHaveBeenCalledWith({
      token: 'token-1',
      config: { theme: 'deep-space' },
    })
    expect(onTokenUpdate).toHaveBeenCalledWith('token-2')
    expect(onThemeChange).toHaveBeenCalledWith('cyber-tech')
    expect(onLanguageChange).toHaveBeenCalledWith('en-US')

    wrapper.unmount()
  })
})
