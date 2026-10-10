import { describe, expect, it } from 'vitest'
import { countryName, currencySymbol, flagEmoji, formatCurrency } from './format'
import { localeTag, offeredLocales, pickLocale } from './locale'

describe('formatCurrency', () => {
  it('formats INR with Indian grouping in English', () => {
    expect(formatCurrency(150000, 'INR', 'en', 'IN')).toBe('₹1,50,000')
  })

  it('formats BDT in Bengali with Bengali digits', () => {
    const out = formatCurrency(90000, 'BDT', 'bn', 'BD')
    expect(out).toContain('৳')
    expect(out).toMatch(/[০-৯]/)
  })

  it('formats GBP for en-GB without decimals', () => {
    expect(formatCurrency(900, 'GBP', 'en', 'GB')).toBe('£900')
  })

  it('returns a narrow currency symbol', () => {
    expect(currencySymbol('INR', 'en', 'IN')).toBe('₹')
  })
})

describe('flags and names', () => {
  it('builds regional-indicator flags', () => {
    expect(flagEmoji('IN')).toBe('🇮🇳')
    expect(flagEmoji('bd')).toBe('🇧🇩')
    expect(flagEmoji('XYZ')).toBe('')
  })

  it('localises country names via Intl.DisplayNames', () => {
    expect(countryName('IN', 'en')).toBe('India')
    expect(countryName('BD', 'bn')).toBe('বাংলাদেশ')
    expect(countryName('IN', 'hi')).toBe('भारत')
  })
})

describe('locale helpers', () => {
  it('intersects country locales with available translations', () => {
    expect(offeredLocales(['bn', 'en'])).toEqual(['bn', 'en'])
    expect(offeredLocales(['en', 'hi', 'ne'])).toEqual(['en', 'hi'])
    expect(offeredLocales([])).toEqual(['en'])
  })

  it('keeps the current language when offered, else browser, else country default', () => {
    expect(pickLocale(['en', 'hi', 'bn'], 'bn', 'en')).toBe('bn')
    expect(pickLocale(['en'], 'bn', 'hi')).toBe('en')
    expect(pickLocale(['bn', 'en'], 'hi', 'en')).toBe('en')
    expect(pickLocale(['bn', 'en'], null, null)).toBe('bn')
  })

  it('builds BCP-47 tags', () => {
    expect(localeTag('bn', 'in')).toBe('bn-IN')
  })
})
