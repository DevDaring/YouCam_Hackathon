import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { currencySymbol } from '../../lib/format'
import { useRegion } from '../../lib/region'
import { choiceClass, fieldClass } from '../ui'
import type { StepProps } from './types'

export function BudgetStep({ draft, update, labelledBy }: StepProps) {
  const { t } = useTranslation()
  const { country, locale, formatMoney } = useRegion()
  const inputId = useId()
  const presetsId = useId()
  if (!country) return null

  const amount = draft.budget?.currency === country.currency ? draft.budget.amount : null
  const isPreset = amount != null && country.budget_presets.includes(amount)
  const symbol = currencySymbol(country.currency, locale, country.code)

  return (
    <div className="space-y-6" role="group" aria-labelledby={labelledBy}>
      <fieldset>
        <legend id={presetsId} className="mb-2 text-sm font-semibold text-heading">
          {t('setup.budgetPresetsLabel')}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {country.budget_presets.map((preset) => (
            <label key={preset} className={`${choiceClass} justify-center font-semibold tabular-nums`}>
              <input
                type="radio"
                name="budget-preset"
                value={preset}
                checked={amount === preset}
                onChange={() => update({ budget: { amount: preset, currency: country.currency } })}
                className="sr-only"
              />
              {formatMoney(preset)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-heading">
          {t('setup.budgetCustomLabel')} ({country.currency})
        </label>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-heading">
            {symbol}
          </span>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder={t('setup.budgetCustomPlaceholder')}
            value={amount != null && !isPreset ? amount : ''}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value))
              update({ budget: Number.isFinite(n) && n > 0 ? { amount: n, currency: country.currency } : null })
            }}
            className={`${fieldClass} tabular-nums`}
            style={{ paddingLeft: `${Math.max(2.75, symbol.length * 0.7 + 1.75)}rem` }}
          />
        </div>
        {amount != null ? (
          <p className="mt-3 font-display text-2xl font-semibold text-heading tabular-nums" aria-live="polite">
            {formatMoney(amount)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
