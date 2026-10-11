import { useId } from 'react'

const HALF =
  'M31.6 58 C25 52 8 40.5 8 25.5 C8 15.5 14.6 9.5 22 9.5 C28.4 9.5 31.4 14.4 31.2 20.8 C30.9 30.5 29.6 45 31.6 58 Z'
const SWIRL =
  'M28.4 46 C21.5 40 12.6 33.5 12.6 25 C12.6 17.6 17.4 13.6 22.2 13.8 C27.2 14 29.2 19.4 26.6 24.6 C24.6 28.6 19 29 17.8 25.6 C16.9 23 18.8 20.6 21.2 21.4'

/**
 * DearYou mark: two paisleys — two families — meeting as one heart, with a glowing
 * marigold "flower soul" in the dip. Original artwork; also exported as public/favicon.svg.
 */
export function LogoMark({ className = 'size-10', title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  const left = `dy-l-${id}`
  const right = `dy-r-${id}`
  const soul = `dy-soul-${id}`
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={left} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9B2C45" />
          <stop offset="1" stopColor="#4A0E1C" />
        </linearGradient>
        <linearGradient id={right} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8CF86" />
          <stop offset="1" stopColor="#E0962A" />
        </linearGradient>
        <radialGradient id={soul}>
          <stop offset="0" stopColor="#FFF6DD" />
          <stop offset=".45" stopColor="#F8CF86" />
          <stop offset="1" stopColor="#F2A93B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={HALF} fill={`url(#${left})`} stroke="#C9A24D" strokeWidth=".9" strokeLinejoin="round" />
      <path d={SWIRL} fill="none" stroke="#F8CF86" strokeWidth="1.5" strokeLinecap="round" />
      <g transform="translate(64 0) scale(-1 1)">
        <path d={HALF} fill={`url(#${right})`} stroke="#C9A24D" strokeWidth=".9" strokeLinejoin="round" />
        <path d={SWIRL} fill="none" stroke="#7A1F33" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <circle cx="32" cy="12" r="7" fill={`url(#${soul})`} />
      <path d="M32 7.6 l1.1 3.3 3.3 1.1 -3.3 1.1 -1.1 3.3 -1.1 -3.3 -3.3 -1.1 3.3 -1.1 Z" fill="#FFF9F0" />
    </svg>
  )
}

/** Mark + "DearYou" wordmark (Fraunces: italic "Dear", bold "You"). Brand stays Latin in every language. */
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
        <span className="font-bold">You</span>
      </span>
    </span>
  )
}
