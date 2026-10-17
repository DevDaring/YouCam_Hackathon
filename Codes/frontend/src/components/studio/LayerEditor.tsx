import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, ArrowUpNarrowWide, Ban, CalendarHeart, Check, Clock, Loader2, RefreshCw, Sparkles, ThumbsUp, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getLayerOptions, type LayerName, type LayerOptions, type LayerPatch, type Look, type LookPreset, type OptionItem } from '../../lib/api'
import type { AppLocale } from '../../lib/locale'
import { GoldRule } from '../Motifs'
import { buttonClass } from '../ui'
import { CATALOGUE_LAYERS, joinList, layerLabel, lookName, type MoneyFormatter } from './lookUtils'

const PRESET_SLOT: Record<LookPreset, 1 | 2 | 3> = { sindoor_dusk: 1, marigold_morning: 2, ivory_moon: 3 }
/** Rough wall-clock per re-rendered layer, for the "~N min" hint. */
const SECONDS_PER_LAYER = 25
const KNOWN_ERRORS = ['look_busy', 'edit_limit', 'invalid_choice', 'not_removable'] as const

interface Props {
  look: Look
  layer: LayerName
  /** True while this look is rendering: applying is blocked until it finishes. */
  busy: boolean
  money: MoneyFormatter
  num: (n: number) => string
  locale: AppLocale
  budget: string | null
  onClose: () => void
  /** Sends the PATCH; rejects with an Error whose message is the server's error code. */
  onApply: (body: LayerPatch) => Promise<void>
}

/** Editor state for every layer kind; only the fields for this layer are used. */
interface Draft {
  itemId: string | null
  preset: LookPreset | null
  lip: string | null
  templateId: string | null
  remove: boolean
}

const sameHex = (a: string | null, b: string | null) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

function initialDraft(o: LayerOptions): Draft {
  return {
    itemId: o.items?.find((i) => i.current)?.id ?? null,
    preset: (o.makeup?.current_preset as LookPreset | undefined) ?? null,
    lip: o.makeup?.current_lip ?? null,
    templateId: o.hair?.find((h) => h.current)?.template_id ?? null,
    remove: false,
  }
}

/** The single change the draft represents, or null when nothing differs from the look. */
function draftPatch(o: LayerOptions, d: Draft): LayerPatch | null {
  if (d.remove) return { enabled: false }
  const start = initialDraft(o)
  if (o.items) return d.itemId && d.itemId !== start.itemId ? { item_id: d.itemId } : null
  if (o.makeup) {
    if (d.preset && d.preset !== start.preset) {
      const mood = o.makeup.presets.find((p) => p.key === d.preset)
      return d.lip && mood && !sameHex(d.lip, mood.lip) ? { preset: d.preset, lip: d.lip } : { preset: d.preset }
    }
    return d.lip && !sameHex(d.lip, start.lip) ? { lip: d.lip } : null
  }
  if (o.hair) return d.templateId && d.templateId !== start.templateId ? { template_id: d.templateId } : null
  return null
}

/**
 * Bottom sheet (phones) / side panel (larger screens) to change one layer of a look. Native
 * <dialog> gives the focus trap and Esc. Options come from GET /options; Apply sends one PATCH.
 */
export function LayerEditor({ look, layer, busy, money, num, locale, budget, onClose, onApply }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const native = useRef(false)
  const titleId = useId()
  const reduce = useReducedMotion() ?? false
  const [options, setOptions] = useState<LayerOptions | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventOnly, setEventOnly] = useState(false)
  const [byPrice, setByPrice] = useState(false)

  const label = layerLabel(t, layer)
  const lower = label.toLocaleLowerCase(locale)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') {
      native.current = true
      if (!dialog.open) dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    getLayerOptions(look.id, layer, ctrl.signal)
      .then((o) => {
        setOptions(o)
        setDraft(initialDraft(o))
        setLoadError(false)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoadError(true)
      })
    return () => ctrl.abort()
  }, [look.id, layer, attempt])

  const close = () => {
    const dialog = ref.current
    if (native.current && dialog?.open) dialog.close() // fires "close" → onClose
    else onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape' && !native.current) {
      e.preventDefault()
      onClose()
    }
  }

  const patch = options && draft ? draftPatch(options, draft) : null
  const noEdits = !!options && options.edits_left <= 0
  const canApply = !!patch && !applying && !busy && !noEdits

  const apply = async () => {
    if (!patch) return
    setApplying(true)
    setError(null)
    try {
      await onApply(patch)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'generic')
      setApplying(false)
    }
  }

  const update = (d: Partial<Draft>) => {
    setError(null)
    setDraft((cur) => (cur ? { ...cur, ...d } : cur))
  }

  const errorText = (code: string) => {
    const known = (KNOWN_ERRORS as readonly string[]).includes(code) ? code : 'generic'
    return t(`studio.edit.errors.${known}`)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-line bg-bg p-0 text-text shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-[34rem] sm:rounded-none sm:rounded-l-3xl"
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex max-h-[92dvh] flex-col sm:h-full sm:max-h-none"
      >
        <header className="shrink-0 px-5 pt-4 sm:px-6 sm:pt-6">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-2xl font-semibold">
                {t('studio.edit.title', { layer: lower })}
                <span className="sr-only"> · </span>
                <span className="mt-1 block font-sans text-sm font-medium text-muted">
                  {t('studio.lookNumber', { n: num(look.slot) })} {lookName(t, look.slot)}
                </span>
              </h2>
              <GoldRule />
            </div>
            <button
              type="button"
              data-autofocus
              onClick={close}
              className="-mr-2 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-heading hover:bg-surface"
              aria-label={t('common.close')}
            >
              <X aria-hidden="true" className="size-6" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 sm:px-6">
          {loadError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl bg-danger/10 p-4">
              <p className="text-sm font-medium text-danger">{t('studio.edit.loadError')}</p>
              <button type="button" className={buttonClass.secondary} onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw aria-hidden="true" className="size-5" />
                {t('common.retry')}
              </button>
            </div>
          ) : !options || !draft ? (
            <div aria-busy="true">
              <p className="sr-only">{t('studio.edit.loading')}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-line/40" />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {options.items ? (
                <ItemPicker
                  layer={layer}
                  items={options.items}
                  selected={draft.itemId}
                  disabled={draft.remove}
                  eventOnly={eventOnly}
                  byPrice={byPrice}
                  money={money}
                  onEventOnly={setEventOnly}
                  onByPrice={setByPrice}
                  onSelect={(itemId) => update({ itemId })}
                />
              ) : null}
              {options.makeup ? (
                <MakeupPicker
                  makeup={options.makeup}
                  preset={draft.preset}
                  lip={draft.lip}
                  disabled={draft.remove}
                  onPreset={(preset, lip) => update({ preset, lip })}
                  onLip={(lip) => update({ lip })}
                />
              ) : null}
              {options.hair ? (
                <HairPicker hair={options.hair} selected={draft.templateId} disabled={draft.remove} onSelect={(templateId) => update({ templateId })} />
              ) : null}
              {options.removable && layer !== 'outfit' ? (
                <button
                  type="button"
                  aria-pressed={draft.remove}
                  onClick={() => update({ remove: !draft.remove })}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-left transition-colors ${
                    draft.remove ? 'border-danger bg-danger/10 text-danger' : 'border-rule/70 text-heading hover:bg-surface'
                  }`}
                >
                  <Ban aria-hidden="true" className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t('studio.edit.remove', { layer: lower })}</span>
                    <span className="block text-xs text-muted">{draft.remove ? t('studio.edit.removeUndo') : t('studio.edit.removeHint')}</span>
                  </span>
                  {draft.remove ? <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={3} /> : null}
                </button>
              ) : null}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          {options && draft ? (
            <Summary options={options} draft={draft} patch={patch} look={look} layer={layer} money={money} num={num} locale={locale} budget={budget} />
          ) : null}
          {busy ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-warning">
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t('studio.edit.errors.look_busy')}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {errorText(error)}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={buttonClass.secondary} onClick={close}>
              {t('studio.edit.cancel')}
            </button>
            <button type="button" className={buttonClass.primary} disabled={!canApply} onClick={() => void apply()}>
              {applying ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Sparkles aria-hidden="true" className="size-5" />}
              {t('studio.edit.apply')}
            </button>
          </div>
        </footer>
      </motion.div>
    </dialog>
  )
}

// ------------------------------------------------------------------ summary footer

function Summary(props: {
  options: LayerOptions
  draft: Draft
  patch: LayerPatch | null
  look: Look
  layer: LayerName
  money: MoneyFormatter
  num: (n: number) => string
  locale: AppLocale
  budget: string | null
}) {
  const { options, draft, patch, look, layer, money, num, locale, budget } = props
  const { t } = useTranslation()
  const lines: ReactNode[] = []

  // Price & budget impact, for catalogue swaps and removals.
  if (patch && CATALOGUE_LAYERS.includes(layer) && options.items) {
    const current = options.items.find((i) => i.current) ?? null
    const next = draft.remove ? null : (options.items.find((i) => i.id === draft.itemId) ?? null)
    const from = Number(current?.price ?? look.layers.find((l) => l.layer === layer)?.item?.price ?? 0) || 0
    const to = draft.remove ? 0 : Number(next?.price ?? 0) || 0
    const total = Number(look.total_price ?? 0) - from + to
    const totalText = money(total)
    const budgetText = money(budget)
    const over = budget != null && Number(budget) > 0 && total > Number(budget)
    const fromText = money(from) ?? '—'
    const toText = draft.remove ? t('studio.edit.removedPrice') : (money(next?.price) ?? '—')
    lines.push(
      <p key="price" className={`text-sm font-semibold ${over ? 'text-warning' : 'text-heading'}`}>
        {fromText} → {toText}
        <span className="font-normal text-muted">
          {' · '}
          {budgetText ? t('studio.edit.totalOf', { total: totalText, budget: budgetText }) : t('studio.edit.totalOnly', { total: totalText })}
        </span>
        {over ? <span> · {t('studio.edit.overBudget')}</span> : null}
      </p>,
    )
  }

  // What gets re-rendered, and roughly what it costs.
  const affected = draft.remove ? options.layers_affected.filter((l) => l !== layer) : options.layers_affected
  const names = joinList(
    affected.map((l) => layerLabel(t, l).toLocaleLowerCase(locale)),
    locale,
  )
  const minutes = Math.max(1, Math.ceil((affected.length * SECONDS_PER_LAYER) / 60))
  lines.push(
    <p key="render" className="text-sm text-text">
      {affected.length
        ? `${t('studio.edit.rerenders', { layers: names })} · ${t('studio.edit.units', { count: options.units_to_rerender, n: num(options.units_to_rerender) })} · ${t('studio.edit.minutes', { n: num(minutes) })}`
        : t('studio.edit.noRerender')}
    </p>,
  )
  lines.push(
    <p key="left" className="text-xs text-muted">
      {options.edits_left > 0 ? t('studio.edit.editsLeft', { count: options.edits_left, n: num(options.edits_left) }) : t('studio.edit.noEditsLeft')}
      {!patch && options.edits_left > 0 ? ` · ${t('studio.edit.noChange')}` : ''}
    </p>,
  )
  return (
    <div aria-live="polite" className="space-y-0.5">
      {lines}
    </div>
  )
}

// ------------------------------------------------------------------ pickers

const cardBase =
  'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-line bg-surface-raised text-left transition-colors hover:border-rule has-[input:checked]:border-primary has-[input:checked]:bg-accent-soft/60 has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50'

function CheckedMark() {
  return (
    <span className="absolute right-2 top-2 hidden size-7 items-center justify-center rounded-full bg-primary text-on-primary shadow group-has-[input:checked]:flex">
      <Check aria-hidden="true" className="size-4" strokeWidth={3} />
    </span>
  )
}

function CurrentTag() {
  const { t } = useTranslation()
  return <span className="inline-flex rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-semibold text-on-primary">{t('studio.edit.current')}</span>
}

function RecommendedTag() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-success/60 bg-success/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-success">
      <ThumbsUp aria-hidden="true" className="size-3" />
      {t('studio.edit.recommended')}
    </span>
  )
}

function Chip({ pressed, onClick, icon, children }: { pressed: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
        pressed ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface-raised text-heading hover:border-rule'
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  )
}

function ItemPicker(props: {
  layer: LayerName
  items: OptionItem[]
  selected: string | null
  disabled: boolean
  eventOnly: boolean
  byPrice: boolean
  money: MoneyFormatter
  onEventOnly: (v: boolean) => void
  onByPrice: (v: boolean) => void
  onSelect: (id: string) => void
}) {
  const { layer, items, selected, disabled, eventOnly, byPrice, money, onEventOnly, onByPrice, onSelect } = props
  const { t, i18n } = useTranslation()
  const name = useId()
  const shown = useMemo(() => {
    let list = eventOnly ? items.filter((i) => i.event_match || i.current) : [...items]
    if (byPrice) {
      const p = (i: OptionItem) => (i.price == null ? Number.POSITIVE_INFINITY : Number(i.price))
      list = [...list].sort((a, b) => p(a) - p(b))
    }
    return list
  }, [items, eventOnly, byPrice])
  const hasEventInfo = items.some((i) => i.event_match) && items.some((i) => !i.event_match)

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="sr-only">{t('studio.edit.optionsLabel', { layer: layerLabel(t, layer).toLocaleLowerCase(i18n.language) })}</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('studio.edit.filtersLabel')}>
        {hasEventInfo ? (
          <Chip pressed={eventOnly} onClick={() => onEventOnly(!eventOnly)} icon={<CalendarHeart className="size-4" />}>
            {t('studio.edit.eventMatch')}
          </Chip>
        ) : null}
        <Chip pressed={byPrice} onClick={() => onByPrice(!byPrice)} icon={<ArrowUpNarrowWide className="size-4" />}>
          {t('studio.edit.sortPrice')}
        </Chip>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((item) => {
          const price = money(item.price)
          return (
            <label key={item.id} className={cardBase}>
              <input
                type="radio"
                name={name}
                value={item.id}
                checked={selected === item.id}
                onChange={() => onSelect(item.id)}
                aria-label={[item.name, price, item.current ? t('studio.edit.current') : null, item.event_match ? t('studio.edit.eventMatch') : null].filter(Boolean).join(' · ')}
                className="sr-only"
              />
              <figure className="relative">
                <img
                  src={item.image_url}
                  alt={t('studio.aiImageAlt', { name: item.name })}
                  loading="lazy"
                  className="aspect-square w-full bg-surface object-cover"
                />
                <figcaption className="bg-accent-soft px-1 py-0.5 text-center text-[0.625rem] font-semibold leading-tight text-on-accent">{t('studio.aiBadge')}</figcaption>
              </figure>
              <CheckedMark />
              <span className="flex flex-1 flex-col gap-1 p-2.5">
                <span className="line-clamp-2 text-sm font-semibold leading-snug text-heading">{item.name}</span>
                {price ? <span className="text-sm font-semibold text-text">{price}</span> : null}
                <span className="mt-auto flex flex-wrap gap-1 pt-0.5">
                  {item.current ? <CurrentTag /> : null}
                  {item.event_match ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-success">
                      <CalendarHeart aria-hidden="true" className="size-3" />
                      {t('studio.edit.eventMatch')}
                    </span>
                  ) : null}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function Swatch({ hex, className = 'size-5' }: { hex: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full border border-line ${className}`} style={{ backgroundColor: hex }} />
}

function MakeupPicker(props: {
  makeup: NonNullable<LayerOptions['makeup']>
  preset: LookPreset | null
  lip: string | null
  disabled: boolean
  onPreset: (preset: LookPreset, lip: string) => void
  onLip: (lip: string) => void
}) {
  const { makeup, preset, lip, disabled, onPreset, onLip } = props
  const { t } = useTranslation()
  const moodName = useId()
  const lipName = useId()
  const hintId = useId()
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-base font-semibold text-heading">{t('studio.edit.moodTitle')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {makeup.presets.map((p) => (
            <label key={p.key} className={`${cardBase} flex-row items-center gap-3 p-3 sm:flex-col sm:items-start`}>
              <input
                type="radio"
                name={moodName}
                value={p.key}
                checked={preset === p.key}
                onChange={() => onPreset(p.key, p.lip)}
                aria-label={p.current ? `${t(`studio.lookNames.look${PRESET_SLOT[p.key] ?? 1}`)} · ${t('studio.edit.current')}` : t(`studio.lookNames.look${PRESET_SLOT[p.key] ?? 1}`)}
                className="sr-only"
              />
              <span className="flex -space-x-1.5" title={t('studio.edit.moodSwatches')}>
                <Swatch hex={p.lip} className="size-7" />
                <Swatch hex={p.blush} className="size-7" />
                <Swatch hex={p.shadow} className="size-7" />
              </span>
              <span className="min-w-0 flex-1 pr-8 sm:pr-0">
                <span className="block font-semibold text-heading">{t(`studio.lookNames.look${PRESET_SLOT[p.key] ?? 1}`)}</span>
                {p.current ? <CurrentTag /> : null}
              </span>
              <CheckedMark />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0" aria-describedby={hintId}>
        <legend className="mb-1 text-base font-semibold text-heading">{t('studio.edit.lipTitle')}</legend>
        <p id={hintId} className="mb-2 text-xs text-muted">
          {t('studio.edit.lipHint')}
        </p>
        <div className="flex flex-wrap gap-1">
          {makeup.lip_shades.map((s) => {
            const shade = t(`studio.edit.shades.${s.key}`, { defaultValue: s.key.replace(/_/g, ' ') })
            return (
              <label
                key={s.key}
                title={shade}
                className="group relative inline-flex size-12 cursor-pointer items-center justify-center rounded-full has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-focus"
              >
                <input type="radio" name={lipName} value={s.hex} checked={sameHex(lip, s.hex)} onChange={() => onLip(s.hex)} aria-label={shade} className="sr-only" />
                <span
                  aria-hidden="true"
                  className="size-9 rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--border)] transition-shadow group-has-[input:checked]:shadow-[0_0_0_3px_var(--primary)]"
                  style={{ backgroundColor: s.hex }}
                />
                <Check aria-hidden="true" className="absolute hidden size-4 text-white drop-shadow group-has-[input:checked]:block" strokeWidth={3} />
              </label>
            )
          })}
        </div>
      </fieldset>
    </fieldset>
  )
}

function HairPicker({ hair, selected, disabled, onSelect }: { hair: NonNullable<LayerOptions['hair']>; selected: string | null; disabled: boolean; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const name = useId()
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-base font-semibold text-heading">{t('studio.edit.hairTitle')}</legend>
      {hair.some((h) => h.recommended) ? (
        <p className="mb-3 flex items-start gap-1.5 text-sm text-muted">
          <ThumbsUp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-heading" />
          {t('studio.edit.hairNote')}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {hair.map((h) => (
          <label key={h.template_id} className={cardBase}>
            <input
              type="radio"
              name={name}
              value={h.template_id}
              checked={selected === h.template_id}
              onChange={() => onSelect(h.template_id)}
              aria-label={[h.title, h.recommended ? t('studio.edit.recommended') : null, h.current ? t('studio.edit.current') : null].filter(Boolean).join(' · ')}
              className="sr-only"
            />
            <img src={h.thumb} alt="" loading="lazy" className="aspect-square w-full bg-surface object-cover object-top" />
            <CheckedMark />
            <span className="flex flex-1 flex-col gap-1 p-2.5">
              <span className="text-sm font-semibold leading-snug text-heading">{h.title}</span>
              {h.recommended || h.current ? (
                <span className="mt-auto flex flex-wrap gap-1">
                  {h.recommended ? <RecommendedTag /> : null}
                  {h.current ? <CurrentTag /> : null}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
