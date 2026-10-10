import { localeTag, type AppLocale } from './locale'

/** Currency formatting using the chosen UI language + country, e.g. ৳৯০,০০০ or ₹75,000. */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: AppLocale,
  countryCode?: string | null,
  options: Intl.NumberFormatOptions = {},
): string {
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    ...options,
  }
  try {
    return new Intl.NumberFormat(localeTag(locale, countryCode), opts).format(amount)
  } catch {
    try {
      return new Intl.NumberFormat(locale, opts).format(amount)
    } catch {
      return `${currency} ${Math.round(amount).toLocaleString()}`
    }
  }
}

/** Short currency symbol for input adornments, e.g. "₹", "৳", "£". */
export function currencySymbol(currency: string, locale: AppLocale, countryCode?: string | null): string {
  try {
    const parts = new Intl.NumberFormat(localeTag(locale, countryCode), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

/** Regional-indicator flag emoji for an ISO 3166-1 alpha-2 code. */
export function flagEmoji(countryCode: string): string {
  const code = countryCode.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

/** Localised country name via Intl.DisplayNames (falls back to the code). */
export function countryName(countryCode: string, locale: AppLocale): string {
  let dn = displayNamesCache.get(locale)
  if (dn === undefined) {
    try {
      dn = new Intl.DisplayNames([locale], { type: 'region' })
    } catch {
      dn = null
    }
    displayNamesCache.set(locale, dn)
  }
  return dn?.of(countryCode.toUpperCase()) ?? countryCode
}

/** Long, localised date for summaries. Input is an ISO yyyy-mm-dd string. */
export function formatEventDate(iso: string, locale: AppLocale, countryCode?: string | null): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  try {
    return new Intl.DateTimeFormat(localeTag(locale, countryCode), { dateStyle: 'long' }).format(date)
  } catch {
    return iso
  }
}

export function todayISO(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

/** Plain number in the UI language's numbering system (Bengali digits for bn). */
export function formatNumber(n: number, locale: AppLocale, countryCode?: string | null): string {
  try {
    return new Intl.NumberFormat(localeTag(locale, countryCode)).format(n)
  } catch {
    return String(n)
  }
}
