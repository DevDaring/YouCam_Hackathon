import type { TFunction } from 'i18next'
import type { LayerName, Look, LookLayer, LooksPayload } from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import type { AppLocale } from '../../lib/locale'

export const SLOTS = [1, 2, 3] as const

/** Layers rendered from a catalogue product (these carry an item with a price). */
export const CATALOGUE_LAYERS: readonly LayerName[] = ['outfit', 'necklace', 'earrings']

export function lookName(t: TFunction, slot: number): string {
  return t(`studio.lookNames.look${slot}`)
}

export function layerLabel(t: TFunction, layer: LayerName): string {
  return t(`studio.layer.${layer}`)
}

export const isWorking = (l: LookLayer) => l.status === 'pending' || l.status === 'rendering'
export const isBad = (l: LookLayer) => l.status === 'failed' || l.status === 'skipped'

/** Whether any layer of any look is still queued or rendering. */
export function hasOpenLayers(p: LooksPayload | null): boolean {
  return !!p?.looks.some((look) => look.layers.some(isWorking))
}

/**
 * A look is busy when a layer is rendering, or layers are queued while the server says a render
 * task is running. Pending layers with no running task (e.g. after a server restart) are not busy,
 * so the retry button can recover them.
 */
export function lookBusy(look: Look, payloadRendering: boolean): boolean {
  return look.layers.some((l) => l.status === 'rendering') || (payloadRendering && look.layers.some((l) => l.status === 'pending'))
}

/** Friendly, translated reason for a failed or skipped layer. Unknown codes are shown verbatim. */
export function layerReason(t: TFunction, error: string | null): string {
  switch (error) {
    case 'no_face':
    case 'error_no_face':
      return t('studio.reason.noFace')
    case 'budget':
      return t('studio.reason.budget')
    case 'interrupted':
      return t('studio.reason.interrupted')
    case 'error_pose':
      return t('studio.reason.pose')
    case 'no_photo':
      return t('studio.reason.noPhoto')
    case 'CreditInsufficiency':
      return t('studio.reason.credits')
    default:
      return t('studio.reason.other', { code: error || 'unknown' })
  }
}

export type MoneyFormatter = (amount: string | number | null | undefined) => string | null

export function makeMoney(currency: string, locale: AppLocale, countryCode: string): MoneyFormatter {
  return (amount) => {
    if (amount == null || amount === '') return null
    const n = Number(amount)
    return Number.isFinite(n) ? formatCurrency(n, currency, locale, countryCode) : null
  }
}

export function makeNumber(locale: AppLocale, countryCode: string) {
  return (n: number) => formatNumber(n, locale, countryCode)
}

/** "hair" / "necklace and hair" in the UI language. */
export function joinList(items: string[], locale: AppLocale): string {
  // Intl.ListFormat is ES2021; the TS lib here predates it, so reach it through a narrow type.
  const LF = (Intl as unknown as { ListFormat?: new (l: string, o: { type: string }) => { format: (i: string[]) => string } }).ListFormat
  try {
    if (LF) return new LF(locale, { type: 'conjunction' }).format(items)
    return items.join(', ')
  } catch {
    return items.join(', ')
  }
}
