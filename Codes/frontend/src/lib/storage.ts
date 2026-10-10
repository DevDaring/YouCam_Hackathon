/**
 * localStorage wrapped in try/catch: private windows, blocked site data and
 * test environments can all throw on access. Callers always get a fallback.
 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — keep working in memory */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  region: 'dearme.region.v1',
  lang: 'dearme.lang.v1',
  theme: 'dearme.theme.v1',
  draft: 'dearme.draft.v1',
} as const
