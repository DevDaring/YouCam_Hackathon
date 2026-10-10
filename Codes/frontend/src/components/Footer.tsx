import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MotifDivider } from './Motifs'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

const PREVIEW_LINKS = [
  { to: '/studio', key: 'studio' },
  { to: '/room/demo', key: 'room' },
  { to: '/pack/demo', key: 'pack' },
  { to: '/store', key: 'store' },
  { to: '/demo', key: 'demo' },
] as const

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="mt-16 pb-10">
      <MotifDivider />
      <div className="mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md space-y-2">
          <p>
            <Logo size="sm" />
          </p>
          <p className="text-sm text-muted">{t('app.tagline')}</p>
          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            {t('footer.privacy')}
          </p>
        </div>
        <nav aria-label={t('header.primaryNav')}>
          <ul className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
            {PREVIEW_LINKS.map((l) => (
              <li key={l.key}>
                <Link to={l.to} className="inline-flex min-h-12 items-center rounded-full px-3 text-heading underline-offset-4 hover:underline">
                  {t(`placeholder.${l.key}.title`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col items-start gap-2">
          <ThemeToggle />
          <p className="text-xs text-muted">{t('footer.madeWith')}</p>
        </div>
      </div>
    </footer>
  )
}
