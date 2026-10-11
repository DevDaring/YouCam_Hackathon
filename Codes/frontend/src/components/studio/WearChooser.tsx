import { Loader2, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Wear } from '../../lib/api'
import { Rosette } from '../Motifs'
import { cardClass } from '../ui'

const OPTIONS: Wear[] = ['women', 'men']

/** Asked once for family members and guests: which styling the three looks should use. */
export function WearChooser({ busy, onChoose }: { busy: boolean; onChoose: (wear: Wear) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="wear-title" className={`${cardClass} relative overflow-hidden`}>
      <Rosette size={120} className="pointer-events-none absolute -right-8 -top-8 text-rule opacity-[0.15]" />
      <h3 id="wear-title" className="relative text-2xl font-semibold">
        {t('studio.wear.title')}
      </h3>
      <p className="relative mt-2 max-w-prose text-muted">{t('studio.wear.body')}</p>
      <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((w) => (
          <button
            key={w}
            type="button"
            disabled={busy}
            onClick={() => onChoose(w)}
            className="flex min-h-24 flex-col items-start justify-center gap-1 rounded-3xl border-2 border-rule/60 bg-surface-raised px-5 py-4 text-left transition-colors hover:border-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="flex items-center gap-2 text-lg font-semibold text-heading">
              {busy ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Sparkles aria-hidden="true" className="size-5" />}
              {t(`studio.wear.${w}`)}
            </span>
            <span className="text-sm text-muted">{t(`studio.wear.${w}Layers`)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
