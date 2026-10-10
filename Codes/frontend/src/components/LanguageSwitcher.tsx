import { Languages } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE_LABELS, LOCALE_ORDER, isAppLocale } from '../lib/locale'
import { useRegion } from '../lib/region'

/** Segmented control on wide screens, compact native select on phones. Only offered languages appear. */
export function LanguageSwitcher() {
  const { t } = useTranslation()
  const { locale, offeredLocales, setLocale } = useRegion()
  const selectId = useId()
  const options = LOCALE_ORDER.filter((l) => offeredLocales.includes(l))

  if (options.length < 2) return null

  return (
    <>
      <div className="relative sm:hidden">
        <label htmlFor={selectId} className="sr-only">
          {t('header.languageLabel')}
        </label>
        <Languages aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-heading" />
        <select
          id={selectId}
          value={locale}
          onChange={(e) => isAppLocale(e.target.value) && setLocale(e.target.value)}
          className="min-h-12 appearance-none rounded-full border border-line bg-surface-raised py-2 pl-9 pr-3 text-sm font-semibold text-heading"
        >
          {options.map((l) => (
            <option key={l} value={l} lang={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label={t('header.languageLabel')} className="hidden items-center rounded-full border border-line bg-surface-raised p-1 sm:flex">
        {options.map((l) => {
          const active = l === locale
          return (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={active}
              onClick={() => setLocale(l)}
              className={[
                'min-h-10 rounded-full px-3.5 text-sm font-semibold transition-colors',
                active ? 'bg-primary text-on-primary' : 'text-heading hover:bg-surface',
              ].join(' ')}
            >
              {LOCALE_LABELS[l]}
            </button>
          )
        })}
      </div>
    </>
  )
}
