import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { STYLES, type StyleTag } from '../../lib/draft'
import { choiceClass } from '../ui'
import type { StepProps } from './types'

export function StyleStep({ draft, update, labelledBy }: StepProps) {
  const { t } = useTranslation()
  const toggle = (s: StyleTag) =>
    update({ styles: draft.styles.includes(s) ? draft.styles.filter((x) => x !== s) : [...draft.styles, s] })

  return (
    <fieldset aria-labelledby={labelledBy} className="flex flex-wrap gap-3">
      {STYLES.map((s) => {
        const on = draft.styles.includes(s)
        return (
          <label key={s} className={`${choiceClass} rounded-full px-5 font-semibold`}>
            <input type="checkbox" checked={on} onChange={() => toggle(s)} className="sr-only" />
            {on ? <Check aria-hidden="true" className="size-4" /> : null}
            {t(`setup.styles.${s}`)}
          </label>
        )
      })}
    </fieldset>
  )
}
