import { useTranslation } from 'react-i18next'
import { useRegion } from '../../lib/region'
import { choiceClass } from '../ui'
import type { StepProps } from './types'

export function EventStep({ draft, update, labelledBy }: StepProps) {
  const { t } = useTranslation()
  const { country } = useRegion()
  const events = country?.events ?? []

  if (events.length === 0) return <p className="text-muted">{t('setup.eventsEmpty')}</p>

  return (
    <fieldset aria-labelledby={labelledBy} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {events.map((key) => (
        <label key={key} className={`${choiceClass} justify-center text-center font-semibold`}>
          <input
            type="radio"
            name="event"
            value={key}
            checked={draft.eventType === key}
            onChange={() => update({ eventType: key })}
            className="sr-only"
          />
          {t(`events.${key}`)}
        </label>
      ))}
    </fieldset>
  )
}
