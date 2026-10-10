import { readJSON, STORAGE_KEYS, writeJSON } from './storage'

export type ThemePreference = 'system' | 'light' | 'dark'

export function getStoredTheme(): ThemePreference {
  const value = readJSON<string>(STORAGE_KEYS.theme, 'system')
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** Applies the [data-theme] override; "system" removes it so prefers-color-scheme wins. */
export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  writeJSON(STORAGE_KEYS.theme, pref)
}

export function nextTheme(pref: ThemePreference): ThemePreference {
  return pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system'
}
