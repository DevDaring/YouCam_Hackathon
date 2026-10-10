import { describe, expect, it } from 'vitest'
import type { Country } from './api'
import { EMPTY_DRAFT, isStepComplete, sanitizeDraft } from './draft'

const IN: Country = {
  code: 'IN',
  currency: 'INR',
  locales: ['en', 'hi', 'bn'],
  timezones: ['Asia/Kolkata'],
  events: ['haldi', 'wedding'],
  budget_presets: [25000],
  cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }],
}

describe('event draft', () => {
  it('sanitises junk from storage', () => {
    expect(sanitizeDraft('nope')).toEqual(EMPTY_DRAFT)
    expect(sanitizeDraft({ step: 99, role: 'king', styles: ['modern', 'x'], date: 'tomorrow' })).toEqual({
      ...EMPTY_DRAFT,
      styles: ['modern'],
    })
  })

  it('validates events against the selected country', () => {
    expect(isStepComplete('event', { ...EMPTY_DRAFT, eventType: 'wedding' }, IN)).toBe(true)
    expect(isStepComplete('event', { ...EMPTY_DRAFT, eventType: 'walima' }, IN)).toBe(false)
  })

  it('requires the budget in the country currency', () => {
    expect(isStepComplete('budget', { ...EMPTY_DRAFT, budget: { amount: 5000, currency: 'INR' } }, IN)).toBe(true)
    expect(isStepComplete('budget', { ...EMPTY_DRAFT, budget: { amount: 5000, currency: 'GBP' } }, IN)).toBe(false)
  })

  it('rejects past dates', () => {
    expect(isStepComplete('date', { ...EMPTY_DRAFT, date: '2000-01-01' }, IN)).toBe(false)
    expect(isStepComplete('date', { ...EMPTY_DRAFT, date: '2999-01-01' }, IN)).toBe(true)
  })
})
