import { CalendarDays } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidEventDate } from '../../lib/draft'
import { formatEventDate, todayISO } from '../../lib/format'
import { useRegion } from '../../lib/region'
import { fieldClass } from '../ui'
import type { StepProps } from './types'

export function DateStep({ draft, update }: StepProps) {
  const { t } = useTranslation()
  const { locale, countryCode } = useRegion()
  const id = useId()
  const errorId = `${id}-error`
  const invalid = draft.date != null && !isValidEventDate(draft.date)

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block text-sm font-semibold text-heading">
        {t('setup.dateLabel')}
      </label>
      <div className="relative">
        <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-heading" />
        <input
          id={id}
          type="date"
          min={todayISO()}
          value={draft.date ?? ''}
          onChange={(e) => update({ date: e.target.value || null })}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={`${fieldClass} pl-12`}
        />
      </div>
      {invalid ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {t('setup.dateInvalid')}
        </p>
      ) : draft.date ? (
        <p className="font-display text-lg text-heading">{formatEventDate(draft.date, locale, countryCode)}</p>
      ) : null}
    </div>
  )
}
