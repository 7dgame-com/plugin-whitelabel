interface HostEventPayload {
  event: string
  pluginUrl?: string
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function notifyHostPluginUrlChanged(pluginUrl: string): void {
  if (window.parent === window) return

  window.parent.postMessage(
    {
      type: 'EVENT',
      id: createMessageId(),
      payload: {
        event: 'plugin-url-changed',
        pluginUrl,
      } satisfies HostEventPayload,
    },
    '*',
  )
}
