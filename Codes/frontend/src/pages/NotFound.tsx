import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { GoldRule, Paisley } from '../components/Motifs'
import { buttonClass } from '../components/ui'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <Paisley size={72} className="text-rule opacity-50" />
      <h1 className="mt-4 text-3xl font-bold">{t('notFound.title')}</h1>
      <GoldRule />
      <p className="mt-4 text-muted">{t('notFound.body')}</p>
      <Link to="/" className={`${buttonClass.primary} mt-8`}>
        {t('placeholder.backHome')}
      </Link>
    </section>
  )
}
