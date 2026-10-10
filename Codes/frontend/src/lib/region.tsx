import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import i18n from '../i18n'
import { getRegions, guessCountry, resolveLocation, type Country, type RegionsResponse } from './api'
import { formatCurrency } from './format'
import { browserLocale, isAppLocale, offeredLocales, pickLocale, type AppLocale } from './locale'
import { readJSON, STORAGE_KEYS, writeJSON } from './storage'

export type RegionSource = 'timezone' | 'geolocation' | 'manual' | 'default'

interface StoredRegion {
  countryCode: string
  city: string | null
  source: RegionSource
}

export type LocateOutcome =
  | { kind: 'ok'; countryCode: string; city: string | null }
  | { kind: 'unsupported'; distanceKm: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'error' }

export interface RegionContextValue {
  status: 'loading' | 'ready' | 'error'
  countries: Country[]
  eventTags: RegionsResponse['events']
  /** The selected country (undefined only while loading / on error). */
  country: Country | undefined
  countryCode: string | null
  city: string | null
  currency: string | null
  locale: AppLocale
  source: RegionSource
  offeredLocales: AppLocale[]
  setCountry: (code: string) => void
  setCity: (city: string | null) => void
  setLocale: (locale: AppLocale) => void
  locateMe: () => Promise<LocateOutcome>
  retry: () => void
  formatMoney: (amount: number, options?: Intl.NumberFormatOptions) => string
}

const RegionContext = createContext<RegionContextValue | null>(null)

function currentTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 10 * 60 * 1000,
    })
  })
}

/** Two decimals ≈ 1 km — enough to find the nearest city, never stored. */
const coarse = (n: number) => Math.round(n * 100) / 100

export function RegionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RegionContextValue['status']>('loading')
  const [data, setData] = useState<RegionsResponse | null>(null)
  const [selection, setSelection] = useState<StoredRegion | null>(null)
  const [locale, setLocaleState] = useState<AppLocale>(() => (isAppLocale(i18n.language) ? i18n.language : 'en'))
  const [attempt, setAttempt] = useState(0)

  // Load supported regions, then decide the initial country.
  useEffect(() => {
    const ctrl = new AbortController()
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const regions = await getRegions(ctrl.signal)
        const known = new Set(regions.countries.map((c) => c.code))
        let next: StoredRegion | null = null

        const stored = readJSON<StoredRegion | null>(STORAGE_KEYS.region, null)
        if (stored && known.has(stored.countryCode)) next = stored

        if (!next) {
          const tz = currentTimeZone()
          let guessed: string | null = null
          if (tz) {
            try {
              guessed = await guessCountry(tz, ctrl.signal)
            } catch {
              // Offline fallback: match the timezone against the regions payload.
              guessed = regions.countries.find((c) => c.timezones.includes(tz))?.code ?? null
            }
          }
          next =
            guessed && known.has(guessed)
              ? { countryCode: guessed, city: null, source: 'timezone' }
              : { countryCode: regions.countries[0]?.code ?? 'IN', city: null, source: 'default' }
        }
        if (cancelled) return
        setData(regions)
        setSelection(next)
        setStatus('ready')
      } catch {
        if (!cancelled && !ctrl.signal.aborted) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [attempt])

  const country = useMemo(
    () => data?.countries.find((c) => c.code === selection?.countryCode),
    [data, selection?.countryCode],
  )
  const offered = useMemo(() => offeredLocales(country?.locales), [country])

  // Persist the location choice only once the user (or a guess) has settled it.
  useEffect(() => {
    if (selection) writeJSON(STORAGE_KEYS.region, selection)
  }, [selection])

  // Keep the UI language inside the set the country offers.
  useEffect(() => {
    if (!country) return
    const next = pickLocale(offered, locale, browserLocale())
    if (next !== locale) setLocaleState(next)
  }, [country, offered, locale])

  // Sync i18next + <html lang>.
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
  }, [locale])

  const setCountry = useCallback(
    (code: string) => {
      if (!data?.countries.some((c) => c.code === code)) return
      setSelection((prev) =>
        prev?.countryCode === code ? { ...prev, source: 'manual' } : { countryCode: code, city: null, source: 'manual' },
      )
    },
    [data],
  )

  const setCity = useCallback((city: string | null) => {
    setSelection((prev) => (prev ? { ...prev, city, source: 'manual' } : prev))
  }, [])

  const setLocale = useCallback((next: AppLocale) => {
    writeJSON(STORAGE_KEYS.lang, next)
    setLocaleState(next)
  }, [])

  const locateMe = useCallback(async (): Promise<LocateOutcome> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return { kind: 'unavailable' }
    let pos: GeolocationPosition
    try {
      pos = await getPosition()
    } catch (err) {
      const code = (err as GeolocationPositionError)?.code
      if (code === 1) return { kind: 'denied' }
      return { kind: 'unavailable' }
    }
    try {
      // Coordinates go to our own server once, rounded, and are never stored.
      const res = await resolveLocation(coarse(pos.coords.latitude), coarse(pos.coords.longitude))
      const supported = res.supported && res.country_code && data?.countries.some((c) => c.code === res.country_code)
      if (!supported || !res.country_code) return { kind: 'unsupported', distanceKm: res.distance_km }
      const code = res.country_code
      setSelection({ countryCode: code, city: res.city, source: 'geolocation' })
      return { kind: 'ok', countryCode: code, city: res.city }
    } catch {
      return { kind: 'error' }
    }
  }, [data])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const formatMoney = useCallback(
    (amount: number, options?: Intl.NumberFormatOptions) =>
      country ? formatCurrency(amount, country.currency, locale, country.code, options) : String(amount),
    [country, locale],
  )

  const value = useMemo<RegionContextValue>(
    () => ({
      status,
      countries: data?.countries ?? [],
      eventTags: data?.events ?? {},
      country,
      countryCode: selection?.countryCode ?? null,
      city: selection?.city ?? null,
      currency: country?.currency ?? null,
      locale,
      source: selection?.source ?? 'default',
      offeredLocales: offered,
      setCountry,
      setCity,
      setLocale,
      locateMe,
      retry,
      formatMoney,
    }),
    [status, data, country, selection, locale, offered, setCountry, setCity, setLocale, locateMe, retry, formatMoney],
  )

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRegion(): RegionContextValue {
  const ctx = useContext(RegionContext)
  if (!ctx) throw new Error('useRegion must be used inside <RegionProvider>')
  return ctx
}
