import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Look } from '../../lib/api'
import { GoldRule } from '../Motifs'
import { TotalLine } from './LookCard'
import { CATALOGUE_LAYERS, layerLabel, lookName, type MoneyFormatter } from './lookUtils'

interface Props {
  look: Look
  photoUrl: string | null
  money: MoneyFormatter
  num: (n: number) => string
  budget: string | null
  onClose: () => void
}

interface Step {
  key: string
  label: string
  url: string
}

/**
 * Full-screen (phone) / centred (desktop) dialog that steps through a look layer by layer:
 * your photo → after outfit → after necklace → … Native <dialog> gives the focus trap and Esc.
 */
export function LookLightbox({ look, photoUrl, money, num, budget, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const native = useRef(false)
  const titleId = useId()
  const reduce = useReducedMotion() ?? false
  const name = lookName(t, look.slot)

  const steps: Step[] = []
  if (photoUrl) steps.push({ key: 'photo', label: t('studio.lightbox.yourPhoto'), url: photoUrl })
  for (const l of look.layers) {
    if (l.status === 'done' && l.render_url) {
      steps.push({ key: l.layer, label: t('studio.lightbox.after', { layer: layerLabel(t, l.layer).toLocaleLowerCase(i18n.language) }), url: l.render_url })
    }
  }
  const [index, setIndex] = useState(() => Math.max(0, steps.length - 1))
  const i = Math.min(index, steps.length - 1)
  const step = steps[i]

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

  const close = () => {
    const dialog = ref.current
    if (native.current && dialog?.open) dialog.close() // fires "close" → onClose
    else onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape' && !native.current) {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowLeft' && i > 0) {
      setIndex(i - 1)
    } else if (e.key === 'ArrowRight' && i < steps.length - 1) {
      setIndex(i + 1)
    }
  }

  const pieces = look.layers.filter((l) => CATALOGUE_LAYERS.includes(l.layer) && l.item)
  const navBtn =
    'inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-rule/70 bg-surface-raised text-heading transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-bg p-0 text-text shadow-2xl sm:m-auto sm:h-auto sm:max-h-[94dvh] sm:max-w-5xl sm:rounded-3xl sm:border sm:border-line"
    >
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('studio.lookNumber', { n: num(look.slot) })}</p>
            <h2 id={titleId} className="text-2xl font-semibold">
              {name}
            </h2>
            <GoldRule />
          </div>
          <button
            type="button"
            data-autofocus
            onClick={close}
            className="-mr-1 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-heading hover:bg-surface"
            aria-label={t('common.close')}
          >
            <X aria-hidden="true" className="size-6" />
          </button>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <figure className="min-w-0">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-raised">
              {step ? (
                <motion.img
                  key={step.url}
                  src={step.url}
                  alt={t('studio.lightbox.imageAlt', { name, step: step.label })}
                  initial={reduce ? false : { opacity: 0.35 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35 }}
                  className="mx-auto max-h-[58dvh] w-auto object-contain sm:max-h-[62dvh]"
                />
              ) : null}
            </div>
            <figcaption className="mt-3 flex items-center justify-between gap-2">
              <button type="button" className={navBtn} onClick={() => setIndex(i - 1)} disabled={i <= 0} aria-label={t('studio.lightbox.prev')}>
                <ChevronLeft aria-hidden="true" className="size-6" />
              </button>
              <div className="min-w-0 text-center" aria-live="polite">
                <p className="font-semibold text-heading">{step?.label}</p>
                <p className="text-xs text-muted">{t('studio.lightbox.stepOf', { current: num(i + 1), total: num(steps.length) })}</p>
              </div>
              <button
                type="button"
                className={navBtn}
                onClick={() => setIndex(i + 1)}
                disabled={i >= steps.length - 1}
                aria-label={t('studio.lightbox.next')}
              >
                <ChevronRight aria-hidden="true" className="size-6" />
              </button>
            </figcaption>
            <ol className="mt-3 flex flex-wrap justify-center gap-2" aria-label={t('studio.lightbox.stepsLabel')}>
              {steps.map((s, n) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setIndex(n)}
                    aria-current={n === i ? 'step' : undefined}
                    className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors ${
                      n === i ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface-raised text-heading hover:border-rule'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
          </figure>

          <section aria-labelledby={`${titleId}-pieces`} className="min-w-0 space-y-3">
            <h3 id={`${titleId}-pieces`} className="text-lg font-semibold">
              {t('studio.lightbox.pieces')}
            </h3>
            {pieces.length ? (
              <ul className="space-y-3">
                {pieces.map((l) => {
                  const item = l.item!
                  const price = money(item.price)
                  return (
                    <li key={l.layer} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
                      <figure className="w-24 shrink-0">
                        <img
                          src={item.image_url}
                          alt={t('studio.aiImageAlt', { name: item.name })}
                          className="aspect-square w-full rounded-xl border border-line/70 bg-surface-raised object-cover"
                        />
                        <figcaption className="mt-1 rounded-md bg-accent-soft px-1 py-0.5 text-center text-[0.625rem] font-semibold leading-tight text-on-accent">
                          {t('studio.aiBadge')}
                        </figcaption>
                      </figure>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{layerLabel(t, l.layer)}</p>
                        <p className="font-medium text-heading">{item.name}</p>
                        {price ? <p className="text-sm font-semibold text-text">{price}</p> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            <TotalLine look={look} money={money} budget={budget} />
            <p className="text-xs text-muted">{t('studio.lightbox.aiNote')}</p>
          </section>
        </div>
      </div>
    </dialog>
  )
}
