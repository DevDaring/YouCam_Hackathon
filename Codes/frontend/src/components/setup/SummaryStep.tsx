import { Camera, Pencil } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { countryCode, city, locale, formatMoney } = useRegion()
  const noteId = useId()
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

      <div className="space-y-2">
        <button type="button" disabled aria-describedby={noteId} className={`${buttonClass.primary} w-full`}>
          <Camera aria-hidden="true" className="size-5" />
          {t('setup.submit')}
        </button>
        <p id={noteId} className="text-center text-sm font-medium text-muted">
          {t('setup.submitNote')}
        </p>
      </div>
    </div>
  )
}
