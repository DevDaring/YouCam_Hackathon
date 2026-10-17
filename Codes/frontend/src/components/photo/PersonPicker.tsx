import { Check, Loader2, UsersRound } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Person } from '../../lib/api'

interface Props {
  people: Person[]
  /** Index of the person being dressed, or null when nobody is chosen yet. */
  selected: number | null
  onChoose: (index: number) => void
  /** Defaults to "We found N people in this photo. Who should we dress?" */
  title?: string
  heading?: 'h2' | 'h3'
  /** Extra line under the faces (matched note, tip). */
  note?: ReactNode
  saving?: boolean
  failed?: boolean
}

/**
 * "Who should we dress?" — large face thumbnails as a native radio group (arrow keys move the
 * choice, Space/Enter or a tap selects). Only the chosen person gets the outfit and styling.
 */
export function PersonPicker({ people, selected, onChoose, title, heading: Heading = 'h2', note, saving = false, failed = false }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const titleId = `${id}-title`
  const helperId = `${id}-helper`
  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-2xl border-2 border-rule/60 bg-accent-soft/40 p-4" data-testid="person-picker">
      <Heading id={titleId} className="flex items-start gap-2 text-lg font-semibold leading-snug text-heading">
        <UsersRound aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>{title ?? t('people.title', { count: people.length })}</span>
      </Heading>
      <p id={helperId} className="text-sm text-text">
        {t('people.helper')}
      </p>
      <div role="radiogroup" aria-labelledby={titleId} aria-describedby={helperId} className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
        {people.map((p) => {
          const checked = selected === p.index
          const label = t('people.person', { n: p.index + 1 })
          return (
            <label
              key={p.index}
              className="relative flex min-h-12 cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-line bg-surface-raised p-2 text-center hover:border-rule has-[input:checked]:border-primary has-[input:checked]:bg-accent-soft has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus motion-safe:transition-colors"
            >
              <input type="radio" name={`${id}-person`} value={p.index} checked={checked} onChange={() => onChoose(p.index)} className="sr-only" />
              <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-line/40">
                <img src={p.thumb_url} alt="" draggable={false} className="size-full object-cover" />
                {checked ? (
                  <span className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-primary text-on-primary shadow-sm ring-2 ring-surface-raised">
                    <Check aria-hidden="true" className="size-5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className={`text-sm font-semibold ${checked ? 'text-on-accent' : 'text-heading'}`}>{label}</span>
            </label>
          )
        })}
      </div>
      <div aria-live="polite" className="space-y-2 empty:hidden">
        {saving ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
            {t('people.saving')}
          </p>
        ) : null}
        {note && !saving ? note : null}
      </div>
      {failed ? (
        <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {t('people.error')}
        </p>
      ) : null}
    </section>
  )
}

/** Small round face crop for "Dressing: [face]" summaries. */
export function PersonThumb({ person, size = 'size-12' }: { person: Person; size?: string }) {
  const { t } = useTranslation()
  return (
    <img
      src={person.thumb_url}
      alt={t('people.person', { n: person.index + 1 })}
      className={`${size} shrink-0 rounded-full border-2 border-primary object-cover`}
    />
  )
}
