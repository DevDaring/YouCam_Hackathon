import { AlertTriangle, CalendarDays, Camera, Clock, Loader2, MapPin, Pencil, RefreshCw, Sparkles, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import { GoldRule } from '../components/Motifs'
import { LookCard } from '../components/studio/LookCard'
import { LookLightbox } from '../components/studio/LookLightbox'
import { layerLabel, makeMoney, makeNumber, SLOTS } from '../components/studio/lookUtils'
import { useLooks } from '../components/studio/useLooks'
import { WearChooser } from '../components/studio/WearChooser'
import { buttonClass, cardClass } from '../components/ui'
import { ApiError, getLatestSession, getSession, type SessionInfo } from '../lib/api'
import { countryName, flagEmoji, formatEventDate } from '../lib/format'
import { useRegion } from '../lib/region'

const KNOWN_ERRORS = ['photo_required', 'round_limit', 'catalogue_empty'] as const

export default function Studio() {
  const { t } = useTranslation()
  const { sessionId } = useParams()
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
      <div className="mx-auto max-w-6xl px-4 py-12" aria-busy={state === 'loading'}>
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
  return <StudioReady session={session} />
}

function StudioReady({ session }: { session: SessionInfo }) {
  const { t } = useTranslation()
  const { locale } = useRegion()
  const looks = useLooks(session.id)
  const { payload, phase, error, notice, busy, events, active, finished } = looks
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const money = useMemo(() => makeMoney(session.currency, locale, session.country_code), [session.currency, session.country_code, locale])
  const num = useMemo(() => makeNumber(locale, session.country_code), [locale, session.country_code])

  const full = session.photos.find((p) => p.kind === 'full')
  const face = session.photos.find((p) => p.kind === 'face')
  const budgetText = money(session.budget_amount)
  const deleteOn = session.delete_after
    ? new Intl.DateTimeFormat(`${locale}-${session.country_code}`, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.delete_after))
    : null

  const hasLooks = !!payload && payload.round > 0 && payload.looks.length > 0
  const openLook = openId ? payload?.looks.find((l) => l.id === openId) : undefined
  const showCards = phase === 'loading' || phase === 'starting' || (phase === 'ready' && hasLooks)
  const working = phase === 'starting' || active

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
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
        {budgetText ? <Chip icon={<Wallet className="size-4" />}>{budgetText}</Chip> : null}
      </ul>

      <section aria-labelledby="studio-looks" className="mt-8 space-y-4">
        <h2 id="studio-looks" className="text-2xl font-semibold">
          {t('studio.looksTitle')}
        </h2>

        {phase !== 'choose' && phase !== 'error' ? (
          <p className="flex items-start gap-2 rounded-2xl border border-line bg-accent-soft/50 px-4 py-3 text-sm text-text">
            {working ? (
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-heading" />
            ) : (
              <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-heading" />
            )}
            <span>{working || !hasLooks ? t('studio.live.note') : t('studio.live.doneNote')}</span>
          </p>
        ) : null}

        {phase === 'choose' ? <WearChooser busy={busy === 'wear'} onChoose={looks.chooseWear} /> : null}

        {phase === 'error' ? <LooksError code={error} sessionId={session.id} onRetry={looks.reload} /> : null}

        {showCards ? (
          <div
            className="relative -mx-4 flex items-start snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-3 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:items-stretch lg:overflow-visible lg:px-0 lg:pb-0"
            aria-busy={phase !== 'ready'}
          >
            {SLOTS.map((slot) => {
              const look = hasLooks ? (payload?.looks.find((l) => l.slot === slot) ?? null) : null
              const toast = look ? ([...events].reverse().find((e) => e.lookId === look.id && e.kind === 'done') ?? null) : null
              return (
                <LookCard
                  key={look?.id ?? `slot-${slot}`}
                  slot={slot}
                  look={look}
                  rendering={payload?.rendering ?? false}
                  photoUrl={full?.url ?? null}
                  money={money}
                  num={num}
                  locale={locale}
                  budget={session.budget_amount}
                  toast={toast}
                  retrying={busy === look?.id}
                  onOpen={setOpenId}
                  onRetry={(id) => void looks.retry(id)}
                />
              )
            })}
          </div>
        ) : null}

        {notice && !confirming ? (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {notice === 'round_limit' ? t('studio.errors.round_limit') : t('studio.errors.action')}
          </p>
        ) : null}

        {payload && hasLooks ? (
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            {confirming ? (
              <div className={`${cardClass} w-full max-w-md space-y-3`}>
                <p className="font-medium text-heading">{t('studio.rebuild.confirm')}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    className={buttonClass.primary}
                    onClick={() => {
                      setConfirming(false)
                      looks.replan()
                    }}
                  >
                    <RefreshCw aria-hidden="true" className="size-5" />
                    {t('studio.rebuild.yes')}
                  </button>
                  <button type="button" className={buttonClass.ghost} onClick={() => setConfirming(false)}>
                    {t('studio.rebuild.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={buttonClass.secondary}
                disabled={active || busy === 'replan' || payload.rounds_left <= 0}
                aria-describedby="rebuild-hint"
                onClick={() => setConfirming(true)}
              >
                {busy === 'replan' ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-5" />}
                {t('studio.rebuild.button')}
              </button>
            )}
            <p id="rebuild-hint" className="text-sm text-muted">
              {payload.rounds_left <= 0
                ? t('studio.rebuild.none')
                : `${t('studio.rebuild.left', { count: payload.rounds_left, n: num(payload.rounds_left) })}${active ? ` · ${t('studio.rebuild.waitFinish')}` : ''}`}
            </p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="studio-photos" className={`${cardClass} mt-10 space-y-4`}>
        <h2 id="studio-photos" className="text-xl font-semibold">
          {t('studio.photosTitle')}
        </h2>
        <div className="grid max-w-md grid-cols-2 gap-3">
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

      {/* Polite, terse progress for screen readers: one line per finished layer. */}
      <div aria-live="polite" className="sr-only">
        {events.map((e) => (
          <p key={e.id}>
            {t(e.kind === 'done' ? 'studio.live.added' : 'studio.live.failed', {
              look: t('studio.lookNumber', { n: num(e.slot) }),
              layer: layerLabel(t, e.layer).toLocaleLowerCase(locale),
            })}
          </p>
        ))}
        {finished > 0 && !active ? <p key={`fin-${finished}`}>{t('studio.live.allDone')}</p> : null}
      </div>

      {openLook ? (
        <LookLightbox
          key={openLook.id}
          look={openLook}
          photoUrl={full?.url ?? null}
          money={money}
          num={num}
          budget={session.budget_amount}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  )
}

function LooksError({ code, sessionId, onRetry }: { code: string | null; sessionId: string; onRetry: () => void }) {
  const { t } = useTranslation()
  const known = (KNOWN_ERRORS as readonly string[]).includes(code ?? '') ? (code as (typeof KNOWN_ERRORS)[number]) : null
  return (
    <div role="alert" className={`${cardClass} flex flex-col items-start gap-3`}>
      <p className="flex items-start gap-2 font-medium text-heading">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        {known ? t(`studio.errors.${known}`) : t('studio.errors.generic')}
      </p>
      {known === 'photo_required' ? (
        <Link to={`/photo/${sessionId}`} className={buttonClass.primary}>
          <Camera aria-hidden="true" className="size-5" />
          {t('studio.errors.addPhoto')}
        </Link>
      ) : known === 'round_limit' ? null : (
        <button type="button" className={buttonClass.secondary} onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="size-5" />
          {t('common.retry')}
        </button>
      )}
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
