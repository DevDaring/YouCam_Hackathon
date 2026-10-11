import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GoldRule } from '../components/Motifs'
import { ProgressDots } from '../components/ProgressDots'
import { BudgetStep } from '../components/setup/BudgetStep'
import { DateStep } from '../components/setup/DateStep'
import { EventStep } from '../components/setup/EventStep'
import { LocationStep } from '../components/setup/LocationStep'
import { RoleStep } from '../components/setup/RoleStep'
import { StyleStep } from '../components/setup/StyleStep'
import { SummaryStep } from '../components/setup/SummaryStep'
import { buttonClass, cardClass } from '../components/ui'
import { formatNumber } from '../lib/format'
import { isStepComplete, SETUP_STEPS, useEventDraft } from '../lib/draft'
import { useRegion } from '../lib/region'

export default function Start() {
  const { t } = useTranslation()
  const { country, locale } = useRegion()
  const { draft, update, reset } = useEventDraft()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const navigated = useRef(false)

  const stepIndex = Math.min(draft.step, SETUP_STEPS.length - 1)
  const step = SETUP_STEPS[stepIndex]
  const total = SETUP_STEPS.length
  const isLast = stepIndex === total - 1
  const canContinue = isStepComplete(step, draft, country)
  const headingId = `setup-step-${step}`

  // Country changed → drop answers that no longer apply (event list and currency are per country).
  useEffect(() => {
    if (!country) return
    const patch: Partial<typeof draft> = {}
    if (draft.eventType && !country.events.includes(draft.eventType)) patch.eventType = null
    if (draft.budget && draft.budget.currency !== country.currency) patch.budget = null
    if (Object.keys(patch).length) update(patch)
  }, [country, draft.eventType, draft.budget, update])

  // Move focus to the new question after the user navigates (not on first render).
  useEffect(() => {
    if (navigated.current) headingRef.current?.focus()
  }, [stepIndex])

  const goTo = (i: number) => {
    navigated.current = true
    update({ step: Math.max(0, Math.min(total - 1, i)) })
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t('setup.title')}</h1>
        <GoldRule />
      </div>

      <div className="mt-6">
        <ProgressDots total={total} current={stepIndex} label={t('setup.progress', { current: formatNumber(stepIndex + 1, locale), total: formatNumber(total, locale) })} />
      </div>

      <form
        className={`${cardClass} mt-6 bg-surface`}
        onSubmit={(e) => {
          e.preventDefault()
          if (canContinue && !isLast) goTo(stepIndex + 1)
        }}
        noValidate
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
              {t(`setup.steps.${step}.title`)}
            </h2>
            <p className="mb-6 mt-2 text-muted">{t(`setup.steps.${step}.help`)}</p>

            {step === 'location' && <LocationStep />}
            {step === 'role' && <RoleStep draft={draft} update={update} labelledBy={headingId} />}
            {step === 'event' && <EventStep draft={draft} update={update} labelledBy={headingId} />}
            {step === 'date' && <DateStep draft={draft} update={update} labelledBy={headingId} />}
            {step === 'budget' && <BudgetStep draft={draft} update={update} labelledBy={headingId} />}
            {step === 'style' && <StyleStep draft={draft} update={update} labelledBy={headingId} />}
            {step === 'summary' && <SummaryStep draft={draft} goTo={goTo} />}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          {stepIndex > 0 ? (
            <button type="button" className={buttonClass.ghost} onClick={() => goTo(stepIndex - 1)}>
              <ArrowLeft aria-hidden="true" className="size-5" />
              {t('setup.back')}
            </button>
          ) : (
            <span />
          )}
          {!isLast ? (
            // Distinct keys: React must not reuse the "Start over" <button> as this submit button,
            // or the click that resets the form also submits it and skips a step.
            <button key="next" type="submit" className={buttonClass.primary} disabled={!canContinue}>
              {t('setup.next')}
              <ArrowRight aria-hidden="true" className="size-5" />
            </button>
          ) : (
            <button
              key="reset"
              type="button"
              className={buttonClass.ghost}
              onClick={() => {
                navigated.current = true
                reset()
              }}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              {t('setup.reset')}
            </button>
          )}
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-muted">{t('setup.draftSaved')}</p>
    </div>
  )
}
