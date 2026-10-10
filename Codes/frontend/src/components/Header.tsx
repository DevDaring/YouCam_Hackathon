import { ChevronDown, LogIn, LogOut, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { countryName, flagEmoji } from '../lib/format'
import { useRegion } from '../lib/region'
import { LanguageSwitcher } from './LanguageSwitcher'
import { LocationSheet } from './LocationSheet'
import { Logo } from './Logo'

export function Header() {
  const { t } = useTranslation()
  const { countryCode, city, locale, status } = useRegion()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { user, status: authStatus, logout } = useAuth()
  const navigate = useNavigate()

  const place = countryCode ? (city ? `${city}, ${countryName(countryCode, locale)}` : countryName(countryCode, locale)) : null
  const chipText = countryCode ? (city ?? countryName(countryCode, locale)) : t('header.chooseLocation')

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          to="/"
          aria-label={t('app.homeLink')}
          className="mr-auto flex min-h-12 shrink-0 items-center rounded-lg"
        >
          <Logo hideWordmarkOnTiny />
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

        {authStatus === 'authenticated' && user ? (
          <button
            type="button"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
            aria-label={t('header.account', { name: user.username })}
            title={t('header.account', { name: user.username })}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-heading hover:bg-surface"
          >
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        ) : authStatus === 'anonymous' ? (
          <Link
            to="/login"
            aria-label={t('header.signIn')}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-heading hover:bg-surface md:w-auto md:gap-2 md:px-4"
          >
            <LogIn aria-hidden="true" className="size-5" />
            <span className="hidden text-sm font-semibold md:inline">{t('header.signIn')}</span>
          </Link>
        ) : null}
      </div>
      <LocationSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </header>
  )
}
