import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyHostPluginUrlChanged } from './hostEvents'

describe('host URL synchronization', () => {
  afterEach(() => vi.restoreAllMocks())

  it('posts the standard plugin-url-changed event when embedded', () => {
    const originalParent = window.parent
    const postMessage = vi.fn()
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage },
    })

    notifyHostPluginUrlChanged('/configs?page=2')

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EVENT',
        payload: {
          event: 'plugin-url-changed',
          pluginUrl: '/configs?page=2',
        },
      }),
      '*',
    )

    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParent,
    })
  })
})
