import { along, mirror, pathLength } from './geometry'

/** ink = main line, soft = lighter secondary line, gold = jewellery, rose = tiny colour accents. */
export type Tone = 'ink' | 'soft' | 'gold' | 'rose'
/** Pen order: 0 figure outline, 1 garment drape, 2 jewellery & details. */
export type Layer = 0 | 1 | 2

export interface Stroke {
  kind: 'path'
  d: string
  w: number
  t: Tone
  l: Layer
  /** Occluder: filled with the paper gradient so lines behind it are hidden. */
  fill?: boolean
  /** Pen timing (seconds), filled in by schedule(). */
  delay: number
  dur: number
}

export interface Dot {
  kind: 'dot'
  x: number
  y: number
  r: number
  t: Tone
  l: Layer
  delay: number
  dur: number
}

export type Mark = Stroke | Dot

/** Collects marks for one figure; `pair` draws a stroke and its mirror image. */
export class Sketch {
  marks: Mark[] = []

  s(d: string, w: number, t: Tone = 'ink', l: Layer = 0, fill = false): this {
    this.marks.push({ kind: 'path', d, w, t, l, fill, delay: 0, dur: 0 })
    return this
  }

  pair(d: string, w: number, t: Tone = 'ink', l: Layer = 0, fill = false): this {
    return this.s(d, w, t, l, fill).s(mirror(d), w, t, l, fill)
  }

  dot(x: number, y: number, r: number, t: Tone = 'gold', l: Layer = 2): this {
    this.marks.push({ kind: 'dot', x, y, r, t, l, delay: 0, dur: 0 })
    return this
  }

  /** n dots evenly along a guide path (the guide itself is not drawn). */
  beads(guide: string, n: number, r: number, t: Tone = 'gold', l: Layer = 2, from = 0, to = 1): this {
    for (const { p } of along(guide, n, from, to)) this.dot(p[0], p[1], r, t, l)
    return this
  }

  pairBeads(guide: string, n: number, r: number, t: Tone = 'gold', l: Layer = 2, from = 0, to = 1): this {
    return this.beads(guide, n, r, t, l, from, to).beads(mirror(guide), n, r, t, l, from, to)
  }
}

/**
 * Pace an invisible pen: layers in order, strokes within a layer in authoring
 * order, overlapping so the figure flows rather than ticks. Returns total seconds.
 */
export function schedule(marks: Mark[], total = 4.6): number {
  const order = [...marks].sort((a, b) => a.l - b.l)
  const len = (m: Mark) => (m.kind === 'dot' ? 5 : Math.max(6, pathLength(m.d)))
  const weights = order.map((m) => Math.pow(len(m), 0.75))
  const sum = weights.reduce((a, b) => a + b, 0)
  const span = total * 0.8
  let acc = 0
  order.forEach((m, i) => {
    m.delay = (acc / sum) * span
    m.dur = m.kind === 'dot' ? 0.35 : Math.min(1.1, Math.max(0.28, (weights[i] / sum) * span * 3.2))
    acc += weights[i]
  })
  return Math.max(...order.map((m) => m.delay + m.dur))
}
