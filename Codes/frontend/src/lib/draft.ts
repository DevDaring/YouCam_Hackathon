import { useCallback, useEffect, useState } from 'react'
import type { Country } from './api'
import { todayISO } from './format'
import { readJSON, removeKey, STORAGE_KEYS, writeJSON } from './storage'

export const ROLES = ['bride', 'groom', 'family', 'guest'] as const
export type Role = (typeof ROLES)[number]

export const STYLES = ['traditional', 'modern', 'minimal', 'statement'] as const
export type StyleTag = (typeof STYLES)[number]

export const SETUP_STEPS = ['location', 'role', 'event', 'date', 'budget', 'style', 'summary'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

export interface Budget {
  amount: number
  currency: string
}

export interface EventDraft {
  step: number
  role: Role | null
  eventType: string | null
  /** ISO yyyy-mm-dd */
  date: string | null
  budget: Budget | null
  styles: StyleTag[]
}

export const EMPTY_DRAFT: EventDraft = {
  step: 0,
  role: null,
  eventType: null,
  date: null,
  budget: null,
  styles: [],
}

/** Defensive parse — localStorage content may be stale or hand-edited. */
export function sanitizeDraft(raw: unknown): EventDraft {
  if (!raw || typeof raw !== 'object') return EMPTY_DRAFT
  const r = raw as Partial<Record<keyof EventDraft, unknown>>
  const step = typeof r.step === 'number' && r.step >= 0 && r.step < SETUP_STEPS.length ? Math.floor(r.step) : 0
  const role = ROLES.includes(r.role as Role) ? (r.role as Role) : null
  const eventType = typeof r.eventType === 'string' ? r.eventType : null
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
  const b = r.budget as Partial<Budget> | null | undefined
  const budget =
    b && typeof b.amount === 'number' && b.amount > 0 && typeof b.currency === 'string'
      ? { amount: b.amount, currency: b.currency }
      : null
  const styles = Array.isArray(r.styles) ? (r.styles.filter((s) => STYLES.includes(s as StyleTag)) as StyleTag[]) : []
  return { step, role, eventType, date, budget, styles }
}

export function isValidEventDate(date: string | null): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayISO()
}

/** Whether the user may continue past `step`. */
export function isStepComplete(step: SetupStep, draft: EventDraft, country: Country | undefined): boolean {
  switch (step) {
    case 'location':
      return !!country
    case 'role':
      return draft.role != null
    case 'event':
      return !!country && draft.eventType != null && country.events.includes(draft.eventType)
    case 'date':
      return isValidEventDate(draft.date)
    case 'budget':
      return !!country && draft.budget != null && draft.budget.currency === country.currency && draft.budget.amount > 0
    case 'style':
      return draft.styles.length > 0
    case 'summary':
      return true
  }
}

export function useEventDraft() {
  const [draft, setDraft] = useState<EventDraft>(() => sanitizeDraft(readJSON(STORAGE_KEYS.draft, null)))

  useEffect(() => {
    writeJSON(STORAGE_KEYS.draft, draft)
  }, [draft])

  const update = useCallback((patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch })), [])
  const reset = useCallback(() => {
    removeKey(STORAGE_KEYS.draft)
    setDraft(EMPTY_DRAFT)
  }, [])

  return { draft, update, reset }
}

/**
 * "Try the demo family": a complete, valid draft for the selected country so judges reach the
 * review step in one tap (bride · wedding-type event ~4 months out · mid budget · traditional).
 */
export function demoFamilyDraft(country: Country, today = new Date()): EventDraft {
  const preferred = ['wedding', 'nikah', 'baraat', 'reception']
  const eventType = preferred.find((e) => country.events.includes(e)) ?? country.events[0] ?? null
  const d = new Date(today.getFullYear(), today.getMonth() + 4, 14)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const presets = country.budget_presets
  const amount = presets[Math.min(1, presets.length - 1)] ?? 0
  return {
    step: SETUP_STEPS.indexOf('summary'),
    role: 'bride',
    eventType,
    date,
    budget: amount > 0 ? { amount, currency: country.currency } : null,
    styles: ['traditional'],
  }
}

export function saveDraft(draft: EventDraft): void {
  writeJSON(STORAGE_KEYS.draft, draft)
}
