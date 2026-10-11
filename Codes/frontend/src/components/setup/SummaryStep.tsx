import { Camera, Pencil } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../../lib/api'
import { IMAGE_RETENTION_HOURS } from '../../lib/config'
import { SETUP_STEPS, type EventDraft, type SetupStep } from '../../lib/draft'
import { countryName, flagEmoji, formatEventDate } from '../../lib/format'
import { useRegion } from '../../lib/region'
import { buttonClass } from '../ui'

interface Props {
  draft: EventDraft
  goTo: (step: number) => void
}

export function SummaryStep({ draft, goTo }: Props) {
  const { t } = useTranslation()
  const { countryCode, city, locale, source, country, formatMoney } = useRegion()
  const navigate = useNavigate()
  const noteId = useId()
  const consentId = useId()
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function continueToPhoto() {
    if (!country || !draft.role || !draft.eventType) return
    setBusy(true)
    setError(null)
    try {
      const session = await createSession({
        country_code: country.code,
        city,
        location_source: source,
        role: draft.role,
        event_type: draft.eventType,
        event_date: draft.date,
        budget_amount: draft.budget?.amount ?? null,
        currency: country.currency,
        locale,
        style_tags: draft.styles,
        consent: true,
      })
      navigate(`/photo/${session.id}`)
    } catch {
      setError(t('setup.submitError'))
      setBusy(false)
    }
  }
  const notSet = <span className="text-muted">{t('setup.notSet')}</span>

  const rows: { step: Exclude<SetupStep, 'summary'>; value: ReactNode }[] = [
    {
      step: 'location',
      value: countryCode
        ? `${flagEmoji(countryCode)} ${city ? `${city}, ` : ''}${countryName(countryCode, locale)}`
        : notSet,
    },
    { step: 'role', value: draft.role ? t(`setup.roles.${draft.role}`) : notSet },
    { step: 'event', value: draft.eventType ? t(`events.${draft.eventType}`) : notSet },
    { step: 'date', value: draft.date ? formatEventDate(draft.date, locale, countryCode) : notSet },
    { step: 'budget', value: draft.budget ? formatMoney(draft.budget.amount) : notSet },
    {
      step: 'style',
      value: draft.styles.length ? draft.styles.map((s) => t(`setup.styles.${s}`)).join(' · ') : notSet,
    },
  ]

  return (
    <div className="space-y-6">
      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
        {rows.map(({ step, value }) => {
          const label = t(`setup.summaryLabels.${step}`)
          return (
            <div key={step} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1 py-1">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
                <dd className="mt-0.5 break-words font-medium">{value}</dd>
              </div>
              <button
                type="button"
                onClick={() => goTo(SETUP_STEPS.indexOf(step))}
                aria-label={t('setup.editLabel', { field: label })}
                className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-heading hover:bg-surface"
              >
                <Pencil aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">{t('setup.edit')}</span>
              </button>
            </div>
          )
        })}
      </dl>

      <div className="space-y-3">
        <label
          htmlFor={consentId}
          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-raised p-4 text-sm has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-focus"
        >
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
          />
          <span>{t('setup.consent', { hours: IMAGE_RETENTION_HOURS })}</span>
        </label>
        <button
          type="button"
          onClick={continueToPhoto}
          disabled={!consent || busy}
          aria-describedby={noteId}
          className={`${buttonClass.primary} w-full`}
        >
          <Camera aria-hidden="true" className="size-5" />
          {busy ? t('common.loading') : t('setup.submit')}
        </button>
        <p id={noteId} role={error ? 'alert' : undefined} className={`text-center text-sm font-medium ${error ? 'text-danger' : 'text-muted'}`}>
          {error ?? t('setup.submitNote')}
        </p>
      </div>
    </div>
  )
}
