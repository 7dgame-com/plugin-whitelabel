import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US'
import zhCN from './locales/zh-CN'

const SUPPORTED_LOCALES = [
  'zh-CN',
  'zh-TW',
  'en-US',
  'ja-JP',
  'th-TH',
] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function initialLocale(): SupportedLocale {
  const requested = new URLSearchParams(window.location.search).get('lang')
  return requested && isSupportedLocale(requested) ? requested : 'zh-CN'
}

const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhCN,
    'en-US': enUS,
    'ja-JP': enUS,
    'th-TH': enUS,
  },
})

export function setLanguage(language: string): void {
  if (isSupportedLocale(language)) {
    i18n.global.locale.value = language
  }
}

export default i18n
