import { readonly, ref } from 'vue'

const DARK_THEMES = new Set(['deep-space', 'cyber-tech'])
const currentTheme = ref('modern-blue')

export function applyTheme(theme: string): void {
  if (!theme) return

  currentTheme.value = theme
  const dark = DARK_THEMES.has(theme)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', dark)
}

export function applyThemeFromConfig(config: Record<string, unknown>): void {
  const urlTheme = new URLSearchParams(window.location.search).get('theme')
  if (urlTheme) {
    applyTheme(urlTheme)
    return
  }

  if (typeof config.theme === 'string') {
    applyTheme(config.theme)
  }
}

export function useTheme() {
  return {
    currentTheme: readonly(currentTheme),
    applyTheme,
  }
}

applyTheme(
  new URLSearchParams(window.location.search).get('theme') || 'modern-blue',
)
