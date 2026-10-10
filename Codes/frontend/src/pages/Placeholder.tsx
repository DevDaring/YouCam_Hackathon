import { motion } from 'framer-motion'
import { ArrowLeft, Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { GoldRule, Paisley, Rosette } from '../components/Motifs'
import { buttonClass } from '../components/ui'

export type PlaceholderKey = 'room' | 'studio' | 'pack' | 'store' | 'demo'

interface Props {
  page: PlaceholderKey
  milestone: string
}

/** Designed empty state for routes that land in later milestones. */
export default function Placeholder({ page, milestone }: Props) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="placeholder-title" className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-[2rem] border border-line bg-surface px-6 py-12 text-center sm:px-10"
      >
        <Rosette size={180} className="pointer-events-none absolute -right-12 -top-12 text-rule opacity-[0.12]" />
        <Paisley size={120} className="pointer-events-none absolute -bottom-6 -left-6 text-rule opacity-[0.12]" />
        <p className="relative inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-maroon-900">
          <Hourglass aria-hidden="true" className="size-4" />
          {t('placeholder.comingIn', { milestone })}
        </p>
        <h1 id="placeholder-title" className="relative mt-6 text-3xl font-bold sm:text-4xl">
          {t(`placeholder.${page}.title`)}
        </h1>
        <GoldRule className="relative mx-auto" />
        <p className="relative mx-auto mt-5 max-w-md text-lg text-muted">{t(`placeholder.${page}.body`)}</p>
        <Link to="/" className={`${buttonClass.secondary} relative mt-8`}>
          <ArrowLeft aria-hidden="true" className="size-5" />
          {t('placeholder.backHome')}
        </Link>
      </motion.div>
    </section>
  )
}
