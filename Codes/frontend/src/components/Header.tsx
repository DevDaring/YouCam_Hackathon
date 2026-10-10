import { ChevronDown, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { countryName, flagEmoji } from '../lib/format'
import { useRegion } from '../lib/region'
import { LanguageSwitcher } from './LanguageSwitcher'
import { LocationSheet } from './LocationSheet'

export function Header() {
  const { t } = useTranslation()
  const { countryCode, city, locale, status } = useRegion()
  const [sheetOpen, setSheetOpen] = useState(false)

  const place = countryCode ? (city ? `${city}, ${countryName(countryCode, locale)}` : countryName(countryCode, locale)) : null
  const chipText = countryCode ? (city ?? countryName(countryCode, locale)) : t('header.chooseLocation')

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          to="/"
          aria-label={t('app.homeLink')}
          className="mr-auto flex min-h-12 items-center rounded-lg font-wordmark text-[1.75rem] font-bold leading-none tracking-tight text-heading"
        >
          Haan
          <span aria-hidden="true" className="ml-0.5 inline-block size-1.5 translate-y-2 rounded-full bg-accent" />
        </Link>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={status === 'loading'}
          aria-haspopup="dialog"
          aria-label={place ? t('header.locationButton', { place }) : t('header.chooseLocation')}
          className="inline-flex min-h-12 min-w-0 max-w-[9.5rem] items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 text-sm font-semibold text-heading hover:bg-surface disabled:opacity-60 sm:max-w-xs"
        >
          {countryCode ? (
            <span aria-hidden="true" className="text-base leading-none">
              {flagEmoji(countryCode)}
            </span>
          ) : (
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
          )}
          <span className="truncate">{status === 'loading' ? t('common.loading') : chipText}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </button>

        <LanguageSwitcher />
      </div>
      <LocationSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </header>
  )
}
