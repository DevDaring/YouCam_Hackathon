import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Ban, Check, Circle, Clock, Expand, Loader2, Minus, Pencil, Plus, RotateCcw, Share2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LayerName, LayerStatus, Look, LookLayer } from '../../lib/api'
import type { AppLocale } from '../../lib/locale'
import { buttonClass } from '../ui'
import { canShare, ENHANCE_UNITS, enhancerName, isBad, joinList, layerLabel, layerReason, lookBusy, lookName, type MoneyFormatter } from './lookUtils'
import type { LayerEvent } from './useLooks'

interface Props {
  slot: number
  /** null while the first round is being planned. */
  look: Look | null
  rendering: boolean
  photoUrl: string | null
  money: MoneyFormatter
  num: (n: number) => string
  locale: AppLocale
  budget: string | null
  toast: LayerEvent | null
  retrying: boolean
  onOpen: (lookId: string) => void
  onRetry: (lookId: string) => void
  /** Opens the layer editor. */
  onEdit: (lookId: string, layer: LayerName) => void
  /** Adds a removed ("off") layer back. */
  onAddBack: (lookId: string, layer: LayerName) => void
  /** `${lookId}:${layer}` while an add-back request is in flight. */
  addingBack: string | null
  /** Starts (or with `remove`, clears) the photo enhancement. */
  onEnhance: (lookId: string, remove?: boolean) => void
  /** An enhance / remove-enhancement request for this look is in flight. */
  enhancing: boolean
  /** Session edit allowance (undefined on older servers). */
  editsLeft?: number
  /** Opens the share sheet (shown once at least one layer is rendered). */
  onShare?: (lookId: string) => void
}

export function LookCard(props: Props) {
  const { slot, look, rendering, photoUrl, money, num, locale, budget, toast, retrying, onOpen, onRetry, onEdit, onAddBack, addingBack, onEnhance, enhancing, editsLeft, onShare } = props
  const { t } = useTranslation()
  const name = lookName(t, slot)
  const busy = look ? lookBusy(look, rendering) : true
  const bad = look?.layers.filter(isBad) ?? []
  const canRetry = !!look && bad.length > 0 && !busy
  const current = look?.layers.find((l) => l.status === 'rendering')
  const done = look?.layers_done ?? 0
  const total = look?.layers_total ?? 0
  const titleId = `look-${slot}-title`
  const busyNoteId = `look-${slot}-edit-busy`
  const lookLabel = t('studio.lookNumber', { n: num(slot) })
  const enh = look?.enhance_status ?? null
  const enhancedUrl = enh === 'done' ? (look?.enhanced_url ?? null) : null
  const [showOriginal, setShowOriginal] = useState(false)
  const showEnhanced = !!enhancedUrl && !showOriginal

  let badge: { text: string; tone: 'work' | 'ok' | 'warn' }
  if (!look || (busy && done === 0)) badge = { text: t('studio.card.starting'), tone: 'work' }
  else if (enh === 'running') badge = { text: t('studio.enhance.running'), tone: 'work' }
  else if (busy) badge = { text: current ? t('studio.card.adding', { layer: layerLabel(t, current.layer).toLocaleLowerCase(locale) }) : t('studio.card.rendering'), tone: 'work' }
  else if (bad.length) badge = { text: t('studio.card.partial'), tone: 'warn' }
  else badge = { text: t('studio.card.ready'), tone: 'ok' }

  const image = (showEnhanced ? enhancedUrl : look?.image_url) ?? null
  const imageAlt = `${t('studio.card.imageAlt', { name, done: num(done), total: num(total) })}${showEnhanced ? `, ${t('studio.enhance.badge').toLocaleLowerCase(locale)}` : ''}`

  return (
    <article
      aria-labelledby={titleId}
      className="relative flex w-[84%] max-w-sm shrink-0 snap-center flex-col overflow-hidden rounded-3xl border border-line bg-surface sm:w-[58%] lg:w-auto lg:max-w-none"
    >
      <div className="relative aspect-[3/4] bg-surface-raised">
        {image ? (
          <button
            type="button"
            onClick={() => look && onOpen(look.id)}
            className="group absolute inset-0 block size-full cursor-zoom-in focus-visible:outline-offset-[-4px]"
            aria-label={t('studio.card.open', { name })}
          >
            <RevealImage src={image} alt={imageAlt} />
            <span className="absolute bottom-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-surface/90 text-heading shadow-sm transition-transform group-hover:scale-105">
              <Expand aria-hidden="true" className="size-5" />
            </span>
          </button>
        ) : (
          <WaitingImage photoUrl={photoUrl} shimmer={busy} />
        )}
        {enh === 'running' && image ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/35">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface/95 px-4 py-2 text-sm font-semibold text-heading shadow-lg">
              <Loader2 className="size-4 animate-spin" />
              {t('studio.enhance.running')}
            </span>
          </div>
        ) : null}
        {enhancedUrl ? (
          <>
            <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary shadow-sm">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {t('studio.enhance.badge')}
            </span>
            <div
              role="group"
              aria-label={t('studio.enhance.compareLabel', { name })}
              className="absolute bottom-3 left-3 inline-flex rounded-full bg-surface/95 p-1 shadow-sm"
            >
              {[
                { key: 'before', original: true },
                { key: 'after', original: false },
              ].map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={showOriginal === b.original}
                  onClick={() => setShowOriginal(b.original)}
                  className={`min-h-10 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                    showOriginal === b.original ? 'bg-primary text-on-primary' : 'text-heading hover:bg-accent-soft/60'
                  }`}
                >
                  {t(`studio.enhance.${b.key}`)}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <span
          className={`pointer-events-none absolute left-3 top-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${
            badge.tone === 'warn' ? 'bg-surface/95 text-warning' : badge.tone === 'ok' ? 'bg-surface/95 text-success' : 'bg-surface/90 text-heading'
          }`}
        >
          {badge.tone === 'work' ? <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" /> : null}
          {badge.tone === 'ok' ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          {badge.tone === 'warn' ? <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{badge.text}</span>
        </span>
        <AnimatePresence>
          {toast ? (
            <motion.span
              key={toast.id}
              aria-hidden="true"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-none absolute inset-x-0 bottom-16 mx-auto flex w-max max-w-[90%] items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary shadow-lg"
            >
              <Sparkles className="size-4 shrink-0" />
              {t('studio.card.added', { layer: layerLabel(t, toast.layer) })}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('studio.lookNumber', { n: num(slot) })}</p>
          <h3 id={titleId} className="font-display text-xl font-semibold text-heading">
            {name}
          </h3>
        </div>

        {look ? (
          <>
            <div>
              <p className="text-sm font-medium text-text">{t('studio.card.progress', { done: num(done), total: num(total) })}</p>
              <div
                role="progressbar"
                aria-label={t('studio.card.progressLabel', { name })}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-valuetext={t('studio.card.progress', { done: num(done), total: num(total) })}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/50"
              >
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={false}
                  animate={{ width: `${total ? (done / total) * 100 : 0}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>

            <ul className="space-y-2" aria-label={t('studio.card.layersLabel', { name })}>
              {look.layers.map((l) => (
                <LayerRow
                  key={l.layer}
                  layer={l}
                  money={money}
                  locale={locale}
                  lookLabel={lookLabel}
                  busy={busy}
                  busyNoteId={busyNoteId}
                  adding={addingBack === `${look.id}:${l.layer}`}
                  onEdit={() => onEdit(look.id, l.layer)}
                  onAddBack={() => onAddBack(look.id, l.layer)}
                />
              ))}
            </ul>
            {busy ? (
              <p id={busyNoteId} className="-mt-1 flex items-start gap-1.5 text-xs text-muted">
                <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {t('studio.edit.busyNote')}
              </p>
            ) : null}

            <TotalLine look={look} money={money} budget={budget} />

            {done > 0 && (!busy || enh === 'running') ? (
              <EnhancePanel look={look} name={name} busy={busy} pending={enhancing} editsLeft={editsLeft} num={num} onEnhance={onEnhance} />
            ) : null}

            {onShare && canShare(look) ? (
              <button
                type="button"
                onClick={() => onShare(look.id)}
                aria-label={t('studio.share.buttonLabel', { name })}
                className={`${buttonClass.secondary} w-full`}
              >
                <Share2 aria-hidden="true" className="size-5" />
                {t('studio.share.button')}
              </button>
            ) : null}

            {canRetry ? (
              <div className="mt-auto space-y-2 rounded-2xl bg-warning/10 p-3">
                <p className="text-sm font-medium text-text">
                  {t('studio.card.partialSummary', {
                    done: num(done),
                    total: num(total),
                    layers: joinList(
                      bad.map((l) => layerLabel(t, l.layer).toLocaleLowerCase(locale)),
                      locale,
                    ),
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => onRetry(look.id)}
                  disabled={retrying}
                  aria-label={t('studio.card.retryLabel', { name })}
                  className={`${buttonClass.secondary} w-full`}
                >
                  {retrying ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <RotateCcw aria-hidden="true" className="size-5" />}
                  {t('common.retry')}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">{t('studio.card.planning')}</p>
        )}
      </div>
    </article>
  )
}

function EnhancePanel(props: {
  look: Look
  name: string
  busy: boolean
  pending: boolean
  editsLeft?: number
  num: (n: number) => string
  onEnhance: (lookId: string, remove?: boolean) => void
}) {
  const { look, name, busy, pending, editsLeft, num, onEnhance } = props
  const { t } = useTranslation()
  const status = look.enhance_status ?? null
  const spin = <Loader2 aria-hidden="true" className="size-5 animate-spin" />
  const spark = <Sparkles aria-hidden="true" className="size-5" />
  const noEdits = editsLeft != null && editsLeft <= 0

  if (status === 'running') {
    return (
      <button type="button" disabled className={`${buttonClass.secondary} w-full`}>
        {spin}
        {t('studio.enhance.running')}
      </button>
    )
  }
  if (status === 'done' && look.enhanced_url) {
    const by = enhancerName(look.enhanced_by)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line/70 bg-surface-raised px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-heading">
          <Sparkles aria-hidden="true" className="size-4 shrink-0" />
          {t('studio.enhance.badge')}
          {by ? <span className="font-normal text-muted">{t('studio.enhance.by', { who: by })}</span> : null}
        </p>
        <button
          type="button"
          onClick={() => onEnhance(look.id, true)}
          disabled={pending || busy}
          aria-label={t('studio.enhance.removeLabel', { name })}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-heading underline-offset-4 hover:underline disabled:opacity-50"
        >
          {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="size-4" />}
          {t('studio.enhance.remove')}
        </button>
      </div>
    )
  }
  if (status === 'failed') {
    return (
      <div className="space-y-2 rounded-2xl bg-warning/10 p-3">
        <p className="flex items-start gap-1.5 text-sm font-medium text-text">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          {t('studio.enhance.failed')}
        </p>
        <button
          type="button"
          onClick={() => onEnhance(look.id)}
          disabled={pending || busy || noEdits}
          aria-label={t('studio.enhance.retryLabel', { name })}
          className={`${buttonClass.secondary} w-full`}
        >
          {pending ? spin : <RotateCcw aria-hidden="true" className="size-5" />}
          {t('common.retry')}
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onEnhance(look.id)}
        disabled={pending || busy || noEdits}
        aria-label={t('studio.enhance.buttonLabel', { name })}
        className={`${buttonClass.secondary} w-full`}
      >
        {pending ? spin : spark}
        {t('studio.enhance.button')}
      </button>
      <p className="text-center text-xs text-muted">
        {noEdits ? t('studio.edit.noEditsLeft') : t('studio.enhance.note', { n: num(ENHANCE_UNITS) })}
      </p>
    </div>
  )
}

function StatusIcon({ status }: { status: LayerStatus }) {
  const cls = 'size-4 shrink-0'
  switch (status) {
    case 'done':
      return <Check aria-hidden="true" className={`${cls} text-success`} strokeWidth={3} />
    case 'rendering':
      return <Loader2 aria-hidden="true" className={`${cls} animate-spin text-heading`} />
    case 'failed':
      return <AlertTriangle aria-hidden="true" className={`${cls} text-danger`} />
    case 'skipped':
      return <Minus aria-hidden="true" className={`${cls} text-muted`} strokeWidth={3} />
    case 'off':
      return <Ban aria-hidden="true" className={`${cls} text-muted`} />
    default:
      return <Circle aria-hidden="true" className={`${cls} text-muted`} />
  }
}

interface RowProps {
  layer: LookLayer
  money: MoneyFormatter
  locale: AppLocale
  lookLabel: string
  busy: boolean
  busyNoteId: string
  adding: boolean
  onEdit: () => void
  onAddBack: () => void
}

const rowBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule/70 bg-surface px-3.5 text-sm font-semibold text-heading transition-colors hover:bg-accent-soft/60 disabled:cursor-not-allowed disabled:opacity-50'

function LayerRow({ layer, money, locale, lookLabel, busy, busyNoteId, adding, onEdit, onAddBack }: RowProps) {
  const { t } = useTranslation()
  const off = layer.status === 'off'
  const item = off ? null : layer.item
  const price = money(item?.price)
  const label = layerLabel(t, layer.layer)
  const lower = label.toLocaleLowerCase(locale)
  return (
    <li className={`relative rounded-2xl border px-3 py-2 ${off ? 'border-dashed border-line bg-transparent' : 'border-line/70 bg-surface-raised'}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-1 inline-flex">
          <StatusIcon status={layer.status} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${off ? 'text-muted' : 'text-heading'}`}>
            {label}
            <span className="sr-only">: {t(`studio.layerStatus.${layer.status}`)}</span>
          </p>
          {off ? <p className="text-xs text-muted">{t('studio.edit.removed')}</p> : null}
          {item ? (
            <p className="line-clamp-2 text-xs text-muted" title={item.name}>
              {item.name}
            </p>
          ) : null}
          {item && price ? <p className="text-xs font-semibold text-text">{price}</p> : null}
          {layer.status === 'failed' || layer.status === 'skipped' ? (
            <p className={`mt-0.5 text-xs ${layer.status === 'failed' ? 'text-danger' : 'text-muted'}`}>{layerReason(t, layer.error)}</p>
          ) : null}
        </div>
        {item ? (
          <img
            src={item.image_url}
            alt={t('studio.aiImageAlt', { name: item.name })}
            loading="lazy"
            className="size-10 shrink-0 rounded-lg border border-line/70 bg-surface object-cover"
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex justify-end">
        {off ? (
          <button
            type="button"
            className={rowBtn}
            onClick={onAddBack}
            disabled={busy || adding}
            aria-label={t('studio.edit.addBackLabel', { layer: lower, look: lookLabel })}
            aria-describedby={busy ? busyNoteId : undefined}
          >
            {adding ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
            {t('studio.edit.addBack')}
          </button>
        ) : (
          <button
            type="button"
            className={rowBtn}
            onClick={onEdit}
            disabled={busy}
            title={busy ? t('studio.edit.busyNote') : undefined}
            aria-label={t('studio.edit.changeLabel', { layer: lower, look: lookLabel })}
            aria-describedby={busy ? busyNoteId : undefined}
          >
            <Pencil aria-hidden="true" className="size-4" />
            {t('studio.edit.change')}
          </button>
        )}
      </div>
    </li>
  )
}

export function TotalLine({ look, money, budget }: { look: Look; money: MoneyFormatter; budget: string | null }) {
  const { t } = useTranslation()
  const total = money(look.total_price)
  if (!total) return null
  const budgetText = money(budget)
  if (look.over_budget) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        {t('studio.total.over', { total })}
      </p>
    )
  }
  return (
    <p className="text-sm text-text">
      <span className="font-semibold">{total}</span>
      <span className="text-muted"> · {budgetText ? t('studio.total.within', { budget: budgetText }) : t('studio.total.noBudget')}</span>
    </p>
  )
}

/** The latest render; a newly finished layer wipes in over the previous image. */
function RevealImage({ src, alt }: { src: string; alt: string }) {
  const reduce = useReducedMotion() ?? false
  const [base, setBase] = useState(src)
  const [loaded, setLoaded] = useState<string | null>(null)
  const cls = 'absolute inset-0 size-full object-cover object-top'
  if (reduce || base === src) return <img src={src} alt={alt} className={cls} />
  return (
    <>
      <img src={base} alt="" aria-hidden="true" className={cls} />
      <motion.img
        key={src}
        src={src}
        alt={alt}
        className={cls}
        onLoad={() => setLoaded(src)}
        initial={{ clipPath: 'inset(0 0 100% 0)', opacity: 0.6 }}
        animate={loaded === src ? { clipPath: 'inset(0 0 0% 0)', opacity: 1 } : { clipPath: 'inset(0 0 100% 0)', opacity: 0.6 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => {
          if (loaded === src) setBase(src)
        }}
      />
    </>
  )
}

/** Before the first layer lands: the shopper's own photo, dimmed, with a soft shimmer. */
function WaitingImage({ photoUrl, shimmer }: { photoUrl: string | null; shimmer: boolean }) {
  const reduce = useReducedMotion() ?? false
  return (
    <div className="absolute inset-0 overflow-hidden">
      {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover object-top opacity-55 saturate-50" /> : null}
      {shimmer && !reduce ? (
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'linear-gradient(105deg, transparent 30%, color-mix(in srgb, var(--accent-soft) 55%, transparent) 50%, transparent 70%)' }}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}
    </div>
  )
}
