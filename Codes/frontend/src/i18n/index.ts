import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { APP_LOCALES, browserLocale, isAppLocale, type AppLocale } from '../lib/locale'
import { readJSON, STORAGE_KEYS } from '../lib/storage'
import bn from './messages/bn.json'
import en from './messages/en.json'
import hi from './messages/hi.json'

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  bn: { translation: bn },
} as const

function initialLanguage(): AppLocale {
  const stored = readJSON<unknown>(STORAGE_KEYS.lang, null)
  if (isAppLocale(stored)) return stored
  return browserLocale() ?? 'en'
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...APP_LOCALES],
  interpolation: { escapeValue: false }, // React already escapes
})

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language

export default i18n
