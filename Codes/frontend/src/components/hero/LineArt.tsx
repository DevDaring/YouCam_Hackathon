import { memo, type CSSProperties } from 'react'
import type { Mark } from './sketch'

const TONE: Record<Mark['t'], string> = {
  ink: 'hb-ink',
  soft: 'hb-soft',
  gold: 'hb-gold',
  rose: 'hb-rose',
}

/**
 * Renders marks as SVG. With `animate`, each stroke is drawn by its own CSS
 * stroke-dashoffset animation (pathLength = 1), delayed so an invisible pen
 * sketches outline → drape → jewellery. Without it, the art is shown complete.
 */
export const LineArt = memo(function LineArt({
  marks,
  animate,
  offset = 0,
  paper,
}: {
  marks: Mark[]
  animate: boolean
  offset?: number
  paper: string
}) {
  return (
    <>
      {marks.map((m, i) => {
        const timing = animate
          ? ({ '--t': `${(m.delay + offset).toFixed(2)}s`, '--d': `${m.dur.toFixed(2)}s` } as CSSProperties)
          : undefined
        if (m.kind === 'dot') {
          return <circle key={i} cx={m.x} cy={m.y} r={m.r} className={`${TONE[m.t]}-fill${animate ? ' hb-pop' : ''}`} style={timing} />
        }
        return (
          <path
            key={i}
            d={m.d}
            pathLength={1}
            strokeWidth={m.w}
            fill={m.fill ? `url(#${paper})` : 'none'}
            className={`${TONE[m.t]}${animate ? (m.fill ? ' hb-draw hb-fillin' : ' hb-draw') : ''}${m.w === 0 ? ' hb-nostroke' : ''}`}
            style={timing}
          />
        )
      })}
    </>
  )
})
