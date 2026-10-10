import { useId } from 'react'

/**
 * DearMe mark: a hand mirror shaped like a jharokha (ogee) arch, holding a heart —
 * "see yourself, loved". Original artwork; also exported as public/favicon.svg.
 */
export function LogoMark({ className = 'size-10', title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  const glass = `dm-glass-${id}`
  const gold = `dm-gold-${id}`
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={glass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF9F0" />
          <stop offset="1" stopColor="#F8CF86" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E7C77A" />
          <stop offset="1" stopColor="#C9A24D" />
        </linearGradient>
      </defs>
      <path d="M29 47 h6 l-0.6 11 a2.4 2.4 0 0 1 -4.8 0 Z" fill={`url(#${gold})`} stroke="#7A1F33" strokeWidth="1.1" strokeLinejoin="round" />
      <path
        d="M32 4 C35 9 40 11.5 44 14.5 C48 17.5 50 22 50 27 V36 C50 44 42 50 32 50 C22 50 14 44 14 36 V27 C14 22 16 17.5 20 14.5 C24 11.5 29 9 32 4 Z"
        fill={`url(#${gold})`}
        stroke="#7A1F33"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M32 9.5 C34.5 13 38.5 15 41.5 17.3 C44.6 19.7 46 23 46 27 V36 C46 42 40 46 32 46 C24 46 18 42 18 36 V27 C18 23 19.4 19.7 22.5 17.3 C25.5 15 29.5 13 32 9.5 Z"
        fill={`url(#${glass})`}
      />
      <path
        d="M32 40.5 C25.5 36 22.6 32.4 22.6 28.6 C22.6 25.6 24.9 23.4 27.6 23.4 C29.5 23.4 31.1 24.5 32 26.1 C32.9 24.5 34.5 23.4 36.4 23.4 C39.1 23.4 41.4 25.6 41.4 28.6 C41.4 32.4 38.5 36 32 40.5 Z"
        fill="#7A1F33"
      />
      <path d="M38.5 15.5 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1 Z" fill="#F2A93B" />
      <path d="M26.2 27 c0.4 -1.6 1.6 -2.4 3 -2.4" stroke="#FFF9F0" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.85" />
    </svg>
  )
}

/** Mark + "DearMe" wordmark (Fraunces: italic "Dear", bold "Me"). Brand stays Latin in every language. */
export function Logo({ size = 'md', hideWordmarkOnTiny = false }: { size?: 'sm' | 'md' | 'lg'; hideWordmarkOnTiny?: boolean }) {
  const mark = { sm: 'size-8', md: 'size-10', lg: 'size-16' }[size]
  const text = { sm: 'text-xl', md: 'text-[1.7rem]', lg: 'text-5xl' }[size]
  return (
    <span className="inline-flex items-center gap-1.5">
      <LogoMark className={`${mark} shrink-0`} />
      <span
        className={`font-wordmark ${text} leading-none tracking-tight text-heading ${hideWordmarkOnTiny ? 'max-[479px]:sr-only' : ''}`}
      >
        <span className="font-normal italic">Dear</span>
        <span className="font-bold">Me</span>
      </span>
    </span>
  )
}
