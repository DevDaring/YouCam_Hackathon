import { motion, type Variants } from 'framer-motion'
import { ArrowRight, Clock3, EyeOff, HeartHandshake, MapPin, Shirt, Sparkles, Vote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { HeroIllustration } from '../components/HeroIllustration'
import { GoldRule, MotifDivider, Paisley, Rosette } from '../components/Motifs'
import { SectionHeading } from '../components/SectionHeading'
import { buttonClass, cardClass } from '../components/ui'
import { IMAGE_RETENTION_HOURS } from '../lib/config'
import { demoFamilyDraft, saveDraft } from '../lib/draft'
import { countryName, flagEmoji, formatNumber } from '../lib/format'
import { useRegion } from '../lib/region'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut', delay: i * 0.08 } }),
}

const STEPS = [
  { key: 'try', Icon: Shirt },
  { key: 'vote', Icon: Vote },
  { key: 'decide', Icon: HeartHandshake },
] as const

const TRUST = [
  { key: 'deletion', Icon: Clock3 },
  { key: 'noJudgment', Icon: EyeOff },
  { key: 'location', Icon: MapPin },
] as const

export default function Landing() {
  const { t } = useTranslation()
  const { locale } = useRegion()

  return (
    <>
      <Hero />
      <MotifDivider className="my-4" />

      <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <SectionHeading id="how-title" title={t('landing.stepsTitle')} intro={t('landing.stepsIntro')} />
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map(({ key, Icon }, i) => (
            <motion.li
              key={key}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-40px' }}
              custom={i}
              className={`${cardClass} relative overflow-hidden`}
            >
              <Paisley size={84} className="absolute -right-4 -top-4 text-rule opacity-15" />
              <div className="flex items-center gap-3">
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-maroon-900">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <span className="font-display text-sm font-semibold uppercase tracking-widest text-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold">{t(`landing.steps.${key}.title`)}</h3>
              <p className="mt-2 text-muted">{t(`landing.steps.${key}.body`)}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <MotifDivider />

      <section aria-labelledby="trust-title" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <SectionHeading id="trust-title" title={t('landing.trustTitle')} />
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {TRUST.map(({ key, Icon }) => (
            <li key={key} className="flex gap-4 rounded-3xl border border-line bg-surface-raised p-5">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-rule text-heading">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">{t(`landing.trust.${key}.title`)}</h3>
                <p className="mt-1 text-muted">{t(`landing.trust.${key}.body`, { hours: formatNumber(IMAGE_RETENTION_HOURS, locale) })}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <AvailableIn />
    </>
  )
}

function Hero() {
  const { t } = useTranslation()
  const { country } = useRegion()
  const navigate = useNavigate()
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <Rosette size={220} className="pointer-events-none absolute -left-16 top-8 text-rule opacity-[0.07]" />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-8 sm:px-6 sm:pt-12 md:grid-cols-[1.1fr_1fr] md:gap-12 md:pb-16 md:pt-16">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-sm font-semibold text-heading">
            <Sparkles aria-hidden="true" className="size-4 text-accent" />
            {t('landing.eyebrow')}
          </p>
          <h1 id="hero-title" className="mt-5 text-4xl font-bold sm:text-5xl lg:text-6xl">
            {t('landing.heroTitle')}
          </h1>
          <GoldRule className="w-20" />
          <p className="mt-5 max-w-xl text-lg text-muted">{t('landing.heroSubtitle')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/start" className={buttonClass.primary}>
              {t('landing.ctaStart')}
              <ArrowRight aria-hidden="true" className="size-5 rtl:rotate-180" />
            </Link>
            <button
              type="button"
              disabled={!country}
              onClick={() => {
                if (!country) return
                saveDraft(demoFamilyDraft(country))
                navigate('/start')
              }}
              className={buttonClass.secondary}
            >
              {t('landing.ctaDemo')}
            </button>
          </div>
        </motion.div>

        <motion.figure
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          className="relative mx-auto w-full max-w-sm"
        >
          <div
            aria-hidden="true"
            className="absolute -inset-6 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(closest-side, var(--glow), transparent)' }}
          />
          <div className="relative">
            <HeroIllustration />
          </div>
          <figcaption className="absolute left-3 top-3 rounded-full bg-maroon-900/85 px-3 py-1 text-xs font-semibold text-ivory-50">
            {t('common.illustration')}
          </figcaption>
        </motion.figure>
      </div>
    </section>
  )
}

function AvailableIn() {
  const { t } = useTranslation()
  const { countries, locale, status, retry } = useRegion()

  return (
    <section aria-labelledby="available-title" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className={`${cardClass} text-center`}>
        <h2 id="available-title" className="text-xl font-semibold">
          {t('landing.availableTitle')}
        </h2>
        <GoldRule className="mx-auto" />
        {status === 'loading' ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="h-10 w-28 animate-pulse rounded-full bg-line/60" />
            ))}
            <span className="sr-only">{t('landing.availableLoading')}</span>
          </div>
        ) : status === 'error' ? (
          <div role="alert" className="mt-5 space-y-3">
            <p className="text-muted">{t('common.regionsError')}</p>
            <button type="button" onClick={retry} className={buttonClass.secondary}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {countries.map((c) => (
              <li
                key={c.code}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface-raised px-3.5 text-sm font-medium"
              >
                <span aria-hidden="true">{flagEmoji(c.code)}</span>
                {countryName(c.code, locale)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
