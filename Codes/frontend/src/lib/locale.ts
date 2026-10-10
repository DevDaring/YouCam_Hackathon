/** UI languages we ship translations for. */
export const APP_LOCALES = ['en', 'hi', 'bn'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

/** Endonyms — always shown in their own script, never translated. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  bn: 'বাংলা',
  hi: 'हिन्दी',
  en: 'English',
}

/** Display order for the language switcher (matches spec: বাংলা / हिन्दी / English). */
export const LOCALE_ORDER: AppLocale[] = ['bn', 'hi', 'en']

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value)
}

/** Intersection of a country's locales with the languages we have, in the country's order. */
export function offeredLocales(countryLocales: readonly string[] | undefined): AppLocale[] {
  const offered = (countryLocales ?? []).filter(isAppLocale)
  return offered.length > 0 ? offered : ['en']
}

/** First browser-preferred language we support, if any. */
export function browserLocale(): AppLocale | null {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const tag of langs) {
      const base = tag?.toLowerCase().split('-')[0]
      if (isAppLocale(base)) return base
    }
  } catch {
    /* navigator unavailable */
  }
  return null
}

/** Pick the UI language for a country: keep `current` if offered, else browser, else country default. */
export function pickLocale(
  offered: readonly AppLocale[],
  current: AppLocale | null,
  browser: AppLocale | null = browserLocale(),
): AppLocale {
  if (current && offered.includes(current)) return current
  if (browser && offered.includes(browser)) return browser
  return offered[0] ?? 'en'
}

/** BCP-47 tag combining UI language and country, e.g. "bn-BD", "hi-IN", "en-GB". */
export function localeTag(locale: AppLocale, countryCode?: string | null): string {
  return countryCode ? `${locale}-${countryCode.toUpperCase()}` : locale
}
