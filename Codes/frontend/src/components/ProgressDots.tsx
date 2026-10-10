interface Props {
  total: number
  current: number
  label: string
}

/** Progress dots; the text label carries the meaning for screen readers. */
export function ProgressDots({ total, current, label }: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <ol className="flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={[
              'h-2.5 rounded-full transition-all duration-300',
              i === current ? 'w-7 bg-primary' : i < current ? 'w-2.5 bg-rule' : 'w-2.5 bg-line',
            ].join(' ')}
          />
        ))}
      </ol>
      <p className="text-sm text-muted" aria-live="polite">
        {label}
      </p>
    </div>
  )
}
