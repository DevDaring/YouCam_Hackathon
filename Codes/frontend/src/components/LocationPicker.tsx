import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, Info, LoaderCircle, LocateFixed, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { countryName, flagEmoji } from '../lib/format'
import { LOCALE_LABELS, LOCALE_ORDER } from '../lib/locale'
import { useRegion, type LocateOutcome } from '../lib/region'
import { buttonClass, fieldClass } from './ui'

type GeoState = { kind: 'idle' } | { kind: 'explaining' } | { kind: 'locating' } | LocateOutcome

function currencyLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code)
    return name ? `${name} (${code})` : code
  } catch {
    return code
  }
}

/**
 * Country + city picker with an opt-in "Use my location" flow.
 * The plain-words explanation is always shown before the browser prompt.
 */
export function LocationPicker() {
  const { t } = useTranslation()
  const region = useRegion()
  const { countries, country, city, locale, offeredLocales, status } = region
  const [geo, setGeo] = useState<GeoState>({ kind: 'idle' })
  const ids = useId()
  const countryId = `${ids}-country`
  const cityId = `${ids}-city`
  const explainId = `${ids}-explain`

  async function runLocate() {
    setGeo({ kind: 'locating' })
    setGeo(await region.locateMe())
  }

  if (status === 'loading') {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-12 animate-pulse rounded-2xl bg-line/60" />
        <div className="h-12 animate-pulse rounded-2xl bg-line/60" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div role="alert" className="space-y-3">
        <p>{t('common.regionsError')}</p>
        <button type="button" className={buttonClass.secondary} onClick={region.retry}>
          {t('common.retry')}
        </button>
      </div>
    )
  }

  const failureMessage =
    geo.kind === 'unsupported'
      ? t('location.unsupported')
      : geo.kind === 'denied'
        ? t('location.denied')
        : geo.kind === 'unavailable'
          ? t('location.unavailable')
          : geo.kind === 'error'
            ? t('location.error')
            : null

  const orderedLanguages = LOCALE_ORDER.filter((l) => offeredLocales.includes(l)).map((l) => LOCALE_LABELS[l])

  return (
    <div className="space-y-5">
      {/* Use my location — explanation first, then the browser prompt */}
      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        {geo.kind === 'explaining' ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-heading">
              <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-success" />
              {t('location.explainTitle')}
            </p>
            <p id={explainId} className="text-muted">
              {t('location.explainBody')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass.primary} aria-describedby={explainId} onClick={runLocate}>
                <LocateFixed aria-hidden="true" className="size-5" />
                {t('location.explainConfirm')}
              </button>
              <button type="button" className={buttonClass.ghost} onClick={() => setGeo({ kind: 'idle' })}>
                {t('location.explainCancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              className={`${buttonClass.secondary} w-full sm:w-auto`}
              onClick={() => setGeo({ kind: 'explaining' })}
              disabled={geo.kind === 'locating'}
            >
              {geo.kind === 'locating' ? (
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
              ) : (
                <LocateFixed aria-hidden="true" className="size-5" />
              )}
              {geo.kind === 'locating' ? t('location.locating') : t('location.useMyLocation')}
            </button>
            <p className="text-sm text-muted">{t('landing.trust.location.body')}</p>
          </div>
        )}

        <div aria-live="polite" className="empty:hidden">
          <AnimatePresence initial={false}>
            {geo.kind === 'ok' ? (
              <motion.p
                key="ok"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-start gap-2 text-success"
              >
                <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <span className="text-text">
                  {geo.city
                    ? t('location.found', { city: geo.city, country: countryName(geo.countryCode, locale) })
                    : t('location.foundCountry', { country: countryName(geo.countryCode, locale) })}
                </span>
              </motion.p>
            ) : null}
            {failureMessage ? (
              <motion.p
                key={geo.kind}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-start gap-2"
              >
                <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
                <span>{failureMessage}</span>
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Manual picker */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={countryId} className="mb-1.5 block text-sm font-semibold text-heading">
            {t('location.countryLabel')}
          </label>
          <select
            id={countryId}
            className={fieldClass}
            value={country?.code ?? ''}
            onChange={(e) => {
              region.setCountry(e.target.value)
              setGeo({ kind: 'idle' })
            }}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {`${flagEmoji(c.code)} ${countryName(c.code, locale)}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={cityId} className="mb-1.5 block text-sm font-semibold text-heading">
            {t('location.cityLabel')}
          </label>
          <select
            id={cityId}
            className={fieldClass}
            value={city ?? ''}
            onChange={(e) => region.setCity(e.target.value || null)}
          >
            <option value="">{t('location.cityPlaceholder')}</option>
            {country?.cities.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {country ? (
        <ul className="space-y-1 text-sm text-muted">
          <li>{t('location.currencyNote', { currency: currencyLabel(country.currency, locale) })}</li>
          <li>{t('location.languagesNote', { languages: orderedLanguages.join(' · ') })}</li>
          <li>{t(`location.source.${region.source}`)}</li>
        </ul>
      ) : null}
    </div>
  )
}
