import { useId } from 'react'

/**
 * Original abstract illustration: a draped silhouette under an arch, with
 * jhumkas, a maang tikka and a marigold garland. No photos, no copied art.
 * Colours are fixed (it reads as a printed invitation card in both themes).
 */
export function HeroIllustration({ title }: { title: string }) {
  const uid = useId().replace(/:/g, '')
  const glow = `glow-${uid}`
  const veil = `veil-${uid}`
  const titleId = `title-${uid}`

  const garland = Array.from({ length: 11 }, (_, i) => {
    const t = i / 10
    const x = 52 + t * 216
    const y = 372 - Math.sin(t * Math.PI) * 26
    return { x, y, r: i % 2 === 0 ? 9 : 7.5 }
  })

  return (
    <svg viewBox="0 0 320 420" role="img" aria-labelledby={titleId} className="h-auto w-full">
      <title id={titleId}>{title}</title>
      <defs>
        <radialGradient id={glow} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#F8CF86" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#F2A93B" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F2A93B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={veil} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F2A93B" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#C9A24D" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Card ground */}
      <rect x="0" y="0" width="320" height="420" rx="28" fill="#FFF9F0" />
      <circle cx="160" cy="190" r="170" fill={`url(#${glow})`} />

      {/* Arch (mehrab) — double gold line */}
      <g fill="none" stroke="#C9A24D" strokeWidth="1.5">
        <path d="M36 420 V176 C36 96 96 44 160 30 C224 44 284 96 284 176 V420" />
        <path d="M50 420 V180 C50 108 104 62 160 48 C216 62 270 108 270 180 V420" strokeDasharray="2 5" />
      </g>

      {/* Small rosettes in the arch corners */}
      {[
        [78, 118],
        [242, 118],
      ].map(([cx, cy]) => (
        <g key={cx} transform={`translate(${cx} ${cy})`} fill="none" stroke="#C9A24D" strokeWidth="1">
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d="M0 -2 C 3 -6 3 -10 0 -13 C -3 -10 -3 -6 0 -2 Z" transform={`rotate(${i * 45})`} />
          ))}
          <circle r="2" fill="#C9A24D" />
        </g>
      ))}

      {/* Body silhouette */}
      <path d="M78 420 C 82 330 112 280 160 272 C 208 280 238 330 242 420 Z" fill="#4A0E1C" />
      <path d="M146 238 H174 V276 C 166 282 154 282 146 276 Z" fill="#7A1F33" />
      <ellipse cx="160" cy="196" rx="38" ry="46" fill="#7A1F33" />

      {/* Veil / dupatta drape with a zari border */}
      <path
        d="M104 214 C 96 120 224 120 216 214 C 224 280 248 350 262 420 L 236 420 C 226 350 210 290 196 252 C 214 230 214 160 160 150 C 106 160 106 230 124 252 C 110 290 94 350 84 420 L 58 420 C 72 350 96 280 104 214 Z"
        fill={`url(#${veil})`}
      />
      <path
        d="M104 214 C 96 120 224 120 216 214 C 224 280 248 350 262 420 M104 214 C 96 280 72 350 58 420"
        fill="none"
        stroke="#4A0E1C"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />

      {/* Maang tikka */}
      <path d="M160 150 V166" stroke="#C9A24D" strokeWidth="1.5" />
      <circle cx="160" cy="170" r="4.5" fill="#F8CF86" stroke="#C9A24D" strokeWidth="1.2" />

      {/* Jhumkas */}
      {[124, 196].map((x) => (
        <g key={x} stroke="#C9A24D" strokeWidth="1.3" fill="#F8CF86">
          <path d={`M${x} 204 V214`} fill="none" />
          <path d={`M${x - 8} 226 A8 8 0 0 1 ${x + 8} 226 Z`} />
          {[-6, 0, 6].map((dx) => (
            <circle key={dx} cx={x + dx} cy={231} r="1.6" stroke="none" fill="#C9A24D" />
          ))}
        </g>
      ))}

      {/* Necklace */}
      <path d="M134 280 Q160 312 186 280" fill="none" stroke="#F8CF86" strokeWidth="2" />
      {Array.from({ length: 7 }, (_, i) => {
        const t = (i + 1) / 8
        const x = (1 - t) * (1 - t) * 134 + 2 * (1 - t) * t * 160 + t * t * 186
        const y = (1 - t) * (1 - t) * 280 + 2 * (1 - t) * t * 312 + t * t * 280
        return <circle key={i} cx={x} cy={y} r={i === 3 ? 5 : 2.4} fill="#F2A93B" stroke="#C9A24D" strokeWidth="0.8" />
      })}

      {/* Marigold garland */}
      <path
        d={`M${garland[0].x} ${garland[0].y} ${garland
          .slice(1)
          .map((p) => `L${p.x} ${p.y}`)
          .join(' ')}`}
        fill="none"
        stroke="#2F7A4D"
        strokeWidth="1.5"
      />
      {garland.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={p.r} fill={i % 2 === 0 ? '#F2A93B' : '#F8CF86'} />
          <circle cx={p.x} cy={p.y} r={p.r * 0.45} fill="none" stroke="#C27C0E" strokeWidth="0.8" />
        </g>
      ))}

      {/* Sparkles */}
      {[
        [64, 230],
        [258, 240],
        [92, 70],
        [232, 66],
      ].map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y - 6} L${x + 1.5} ${y - 1.5} L${x + 6} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 6} L${x - 1.5} ${y + 1.5} L${x - 6} ${y} L${x - 1.5} ${y - 1.5} Z`}
          fill="#C9A24D"
        />
      ))}
    </svg>
  )
}
