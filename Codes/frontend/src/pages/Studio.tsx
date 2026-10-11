import { CalendarDays, Camera, MapPin, Pencil, Sparkles, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import { GoldRule, Rosette } from '../components/Motifs'
import { buttonClass, cardClass } from '../components/ui'
import { ApiError, getLatestSession, getSession, type SessionInfo } from '../lib/api'
import { countryName, flagEmoji, formatEventDate } from '../lib/format'
import { useRegion } from '../lib/region'

const LOOK_NAMES = ['look1', 'look2', 'look3'] as const

export default function Studio() {
  const { t } = useTranslation()
  const { sessionId } = useParams()
  const { locale } = useRegion()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading')

  useEffect(() => {
    const ctrl = new AbortController()
    ;(sessionId ? getSession(sessionId, ctrl.signal) : getLatestSession(ctrl.signal))
      .then((s) => {
        setSession(s)
        setState('ready')
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setState(err instanceof ApiError && err.status === 404 ? 'none' : 'error')
      })
    return () => ctrl.abort()
  }, [sessionId])

  if (state === 'none') return <Navigate to="/start" replace />
  if (state === 'loading' || !session) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12" aria-busy={state === 'loading'}>
        {state === 'error' ? (
          <p role="alert" className="text-center text-danger">
            {t('common.regionsError')}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-3xl bg-line/40" />
            ))}
          </div>
        )}
      </div>
    )
  }

  const full = session.photos.find((p) => p.kind === 'full')
  const face = session.photos.find((p) => p.kind === 'face')
  const money =
    session.budget_amount != null
      ? new Intl.NumberFormat(`${locale}-${session.country_code}`, { style: 'currency', currency: session.currency, maximumFractionDigits: 0 }).format(Number(session.budget_amount))
      : null
  const deleteOn = session.delete_after
    ? new Intl.DateTimeFormat(`${locale}-${session.country_code}`, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.delete_after))
    : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t('studio.title')}</h1>
        <GoldRule />
        <p className="mt-4 max-w-prose text-muted">{t('studio.intro', { event: t(`events.${session.event_type}`) })}</p>
      </div>

      <ul className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        <Chip icon={<MapPin className="size-4" />}>
          {flagEmoji(session.country_code)} {session.city ? `${session.city}, ` : ''}
          {countryName(session.country_code, locale)}
        </Chip>
        <Chip icon={<Sparkles className="size-4" />}>{t(`events.${session.event_type}`)}</Chip>
        {session.event_date ? <Chip icon={<CalendarDays className="size-4" />}>{formatEventDate(session.event_date, locale, session.country_code)}</Chip> : null}
        {money ? <Chip icon={<Wallet className="size-4" />}>{money}</Chip> : null}
      </ul>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section aria-labelledby="studio-photos" className={`${cardClass} space-y-4`}>
          <h2 id="studio-photos" className="text-xl font-semibold">
            {t('studio.photosTitle')}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { p: full, key: 'full' as const },
              { p: face, key: 'face' as const },
            ].map(({ p, key }) => (
              <figure key={key} className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
                {p ? (
                  <img src={p.url} alt={t(`photo.previewAlt.${key}`)} className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center p-3 text-center text-sm text-muted">{t('studio.noFace')}</div>
                )}
                <figcaption className="px-3 py-2 text-xs font-semibold text-muted">{t(`studio.photoLabel.${key}`)}</figcaption>
              </figure>
            ))}
          </div>
          {deleteOn ? <p className="text-sm text-muted">{t('studio.deleteOn', { when: deleteOn })}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Link to={`/photo/${session.id}`} className={buttonClass.secondary}>
              <Camera aria-hidden="true" className="size-5" />
              {t('studio.retake')}
            </Link>
            <Link to="/start" className={buttonClass.ghost}>
              <Pencil aria-hidden="true" className="size-4" />
              {t('studio.editEvent')}
            </Link>
          </div>
        </section>

        <section aria-labelledby="studio-looks" className="space-y-4">
          <h2 id="studio-looks" className="text-xl font-semibold">
            {t('studio.looksTitle')}
          </h2>
          <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-rule bg-accent-soft p-5">
            <Rosette size={120} className="pointer-events-none absolute -right-8 -top-8 text-rule opacity-[0.15]" />
            <p className="relative font-semibold text-on-accent">{t('studio.renderingTitle')}</p>
            <p className="relative mt-1 text-sm text-on-accent">{t('studio.renderingBody')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {LOOK_NAMES.map((n, i) => (
              <article key={n} className="overflow-hidden rounded-3xl border border-line bg-surface">
                <div className="relative aspect-[3/4] bg-surface-raised">
                  {full ? <img src={full.url} alt="" className="size-full object-cover opacity-60 saturate-50" /> : null}
                  <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold text-heading">
                    {t('studio.waiting')}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('studio.lookNumber', { n: i + 1 })}</p>
                  <h3 className="font-display text-lg font-semibold text-heading">{t(`studio.lookNames.${n}`)}</h3>
                  <p className="mt-1 text-sm text-muted">{t('studio.layers')}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 font-medium text-heading">
      <span aria-hidden="true">{icon}</span>
      {children}
    </li>
  )
}
