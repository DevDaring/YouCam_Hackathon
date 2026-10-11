/**
 * Original line-art motifs (paisley + rosette), drawn for DearYou.
 * Purely decorative: always aria-hidden and rendered at low opacity.
 */

/** A small eight-petal rosette, built from rotated petals around a centre. */
export function Rosette({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true" focusable="false" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d="M0 -3 C 4 -8 4 -14 0 -18 C -4 -14 -4 -8 0 -3 Z" transform={`rotate(${i * 45})`} />
        ))}
        <circle r="3" />
        <circle r="10.5" strokeDasharray="1.5 3" />
      </g>
    </svg>
  )
}

/** A single paisley (buta) with an inner curl. */
export function Paisley({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M30 6 C 44 14 44 34 30 42 C 18 48 6 40 8 28 C 10 18 22 16 26 24 C 29 30 23 35 18 32" />
        <path d="M30 6 C 26 3 22 4 20 7" />
        <circle cx="20" cy="27" r="1.6" />
        <path d="M34 16 C 38 22 38 30 33 36" strokeDasharray="1 3" />
      </g>
    </svg>
  )
}

/** Section divider: thin gold line, rosette at the centre, paisleys at the ends. */
export function MotifDivider({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`mx-auto flex w-full max-w-3xl items-center gap-3 px-4 text-rule opacity-40 ${className}`}>
      <Paisley size={22} className="shrink-0 -scale-x-100" />
      <span className="h-px flex-1 bg-current" />
      <Rosette size={26} className="shrink-0" />
      <span className="h-px flex-1 bg-current" />
      <Paisley size={22} className="shrink-0" />
    </div>
  )
}

/** Thin gold rule placed under headings. */
export function GoldRule({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`gold-rule mt-3 ${className}`} />
}
