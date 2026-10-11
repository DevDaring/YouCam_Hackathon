/**
 * Tiny path toolkit for the hero line art. Paths are authored with absolute
 * M / L / Q / C / Z commands only, so every number pair is an (x, y) point —
 * which makes mirroring, sampling and decorating them cheap and exact.
 */

export type Pt = [number, number]

interface Seg {
  /** Control polygon including the start point: 2 (line), 3 (quad) or 4 (cubic) points. */
  pts: Pt[]
}

const TOKEN = /[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi

/** Split a path into sub-paths of segments. */
function parse(d: string): Seg[][] {
  const tokens = d.match(TOKEN) ?? []
  const subs: Seg[][] = []
  let cur: Seg[] = []
  let pos: Pt = [0, 0]
  let start: Pt = [0, 0]
  let cmd = 'M'
  let i = 0
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/[MLQCZ]/i.test(tokens[i])) cmd = tokens[i++].toUpperCase()
    if (cmd === 'Z') {
      if (pos[0] !== start[0] || pos[1] !== start[1]) cur.push({ pts: [pos, start] })
      pos = start
      continue
    }
    if (cmd === 'M') {
      if (cur.length) subs.push(cur)
      cur = []
      pos = [num(), num()]
      start = pos
      cmd = 'L'
      continue
    }
    const n = cmd === 'L' ? 1 : cmd === 'Q' ? 2 : 3
    const pts: Pt[] = [pos]
    for (let k = 0; k < n; k++) pts.push([num(), num()])
    cur.push({ pts })
    pos = pts[pts.length - 1]
  }
  if (cur.length) subs.push(cur)
  return subs
}

function evalSeg(s: Seg, t: number): Pt {
  const p = s.pts
  const u = 1 - t
  if (p.length === 2) return [p[0][0] * u + p[1][0] * t, p[0][1] * u + p[1][1] * t]
  if (p.length === 3) {
    const a = u * u
    const b = 2 * u * t
    const c = t * t
    return [a * p[0][0] + b * p[1][0] + c * p[2][0], a * p[0][1] + b * p[1][1] + c * p[2][1]]
  }
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const e = t * t * t
  return [
    a * p[0][0] + b * p[1][0] + c * p[2][0] + e * p[3][0],
    a * p[0][1] + b * p[1][1] + c * p[2][1] + e * p[3][1],
  ]
}

/** Dense polyline approximation of a path (all sub-paths concatenated). */
export function sample(d: string, perSeg = 24): Pt[] {
  const out: Pt[] = []
  for (const sub of parse(d)) {
    sub.forEach((s, si) => {
      const steps = s.pts.length === 2 ? 1 : perSeg
      for (let k = si === 0 ? 0 : 1; k <= steps; k++) out.push(evalSeg(s, k / steps))
    })
  }
  return out
}

/** Approximate rendered length (used to pace the pen). */
export function pathLength(d: string): number {
  let len = 0
  for (const sub of parse(d)) {
    for (const s of sub) {
      const steps = s.pts.length === 2 ? 1 : 16
      let prev = s.pts[0]
      for (let k = 1; k <= steps; k++) {
        const p = evalSeg(s, k / steps)
        len += Math.hypot(p[0] - prev[0], p[1] - prev[1])
        prev = p
      }
    }
  }
  return len
}

/** n points spaced evenly by arc length along the first sub-path, with tangents. */
export function along(d: string, n: number, from = 0, to = 1): { p: Pt; tan: Pt }[] {
  const pts = sample(d, 40)
  const cum = [0]
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]))
  const total = cum[cum.length - 1]
  const res: { p: Pt; tan: Pt }[] = []
  let j = 1
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? (from + to) / 2 : from + ((to - from) * k) / (n - 1)
    const target = f * total
    while (j < cum.length - 1 && cum[j] < target) j++
    const seg = cum[j] - cum[j - 1] || 1
    const t = Math.min(1, Math.max(0, (target - cum[j - 1]) / seg))
    const a = pts[j - 1]
    const b = pts[j]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    res.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], tan: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] })
  }
  return res
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** Mirror a path horizontally around x = cx (default: the centre line of the art). */
export function mirror(d: string, cx = 160): string {
  let isX = true
  return d.replace(/[MLQCZ]|-?\d*\.?\d+/gi, (tok) => {
    if (/[MLQCZ]/i.test(tok)) {
      isX = true
      return tok
    }
    const v = Number(tok)
    const out = isX ? r1(2 * cx - v) : v
    isX = !isX
    return String(out)
  })
}

/** Translate / scale a path (x' = ox + x*s, y' = oy + y*s). */
export function place(d: string, ox: number, oy: number, s = 1, sy = s): string {
  let isX = true
  return d.replace(/[MLQCZ]|-?\d*\.?\d+/gi, (tok) => {
    if (/[MLQCZ]/i.test(tok)) {
      isX = true
      return tok
    }
    const v = Number(tok)
    const out = isX ? r1(ox + v * s) : r1(oy + v * sy)
    isX = !isX
    return String(out)
  })
}

/** Rotate a path around (cx, cy) by deg. */
export function rotate(d: string, deg: number, cx: number, cy: number): string {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const nums: number[] = []
  d.replace(/-?\d*\.?\d+/g, (t) => {
    nums.push(Number(t))
    return t
  })
  let k = 0
  return d.replace(/-?\d*\.?\d+/g, () => {
    const i = k++
    const pair = i - (i % 2)
    const x = nums[pair] - cx
    const y = nums[pair + 1] - cy
    return String(r1(i % 2 === 0 ? cx + x * c - y * s : cy + x * s + y * c))
  })
}

/**
 * A chain of small arcs (lace / scallop edge) following a guide path.
 * side = 1 bulges to the left of travel direction, -1 to the right.
 */
export function scallops(d: string, n: number, depth: number, side = 1, from = 0, to = 1): string {
  const pts = along(d, n + 1, from, to)
  let out = `M${r1(pts[0].p[0])} ${r1(pts[0].p[1])}`
  for (let k = 0; k < n; k++) {
    const a = pts[k].p
    const b = pts[k + 1].p
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = (dy / len) * side * depth * 1.33
    const ny = (-dx / len) * side * depth * 1.33
    out += ` C${r1(a[0] + nx)} ${r1(a[1] + ny)} ${r1(b[0] + nx)} ${r1(b[1] + ny)} ${r1(b[0])} ${r1(b[1])}`
  }
  return out
}

/** A gentle wave (sinuous line) that weaves across a guide path — for zari / gota borders. */
export function wave(d: string, n: number, amp: number, from = 0, to = 1): string {
  const pts = along(d, n + 1, from, to)
  let out = `M${r1(pts[0].p[0])} ${r1(pts[0].p[1])}`
  for (let k = 0; k < n; k++) {
    const a = pts[k].p
    const b = pts[k + 1].p
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const s = k % 2 === 0 ? 1 : -1
    const nx = (dy / len) * s * amp * 1.33
    const ny = (-dx / len) * s * amp * 1.33
    out += ` C${r1(a[0] + nx + dx * 0.25)} ${r1(a[1] + ny + dy * 0.25)} ${r1(b[0] + nx - dx * 0.25)} ${r1(b[1] + ny - dy * 0.25)} ${r1(b[0])} ${r1(b[1])}`
  }
  return out
}

/** Circle as two cubic halves (so it can be "drawn" like any other stroke). */
export function ring(cx: number, cy: number, r: number, ry = r): string {
  const k = 0.5523
  return (
    `M${r1(cx - r)} ${r1(cy)} C${r1(cx - r)} ${r1(cy + ry * k)} ${r1(cx - r * k)} ${r1(cy + ry)} ${r1(cx)} ${r1(cy + ry)}` +
    ` C${r1(cx + r * k)} ${r1(cy + ry)} ${r1(cx + r)} ${r1(cy + ry * k)} ${r1(cx + r)} ${r1(cy)}` +
    ` C${r1(cx + r)} ${r1(cy - ry * k)} ${r1(cx + r * k)} ${r1(cy - ry)} ${r1(cx)} ${r1(cy - ry)}` +
    ` C${r1(cx - r * k)} ${r1(cy - ry)} ${r1(cx - r)} ${r1(cy - ry * k)} ${r1(cx - r)} ${r1(cy)}`
  )
}

/** A petal / leaf shape between two points with a given half-width. */
export function petal(ax: number, ay: number, bx: number, by: number, w: number): string {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * w
  const ny = (dx / len) * w
  return (
    `M${r1(ax)} ${r1(ay)} C${r1(ax + dx * 0.25 + nx)} ${r1(ay + dy * 0.25 + ny)} ${r1(ax + dx * 0.8 + nx * 0.6)} ${r1(ay + dy * 0.8 + ny * 0.6)} ${r1(bx)} ${r1(by)}` +
    ` C${r1(ax + dx * 0.8 - nx * 0.6)} ${r1(ay + dy * 0.8 - ny * 0.6)} ${r1(ax + dx * 0.25 - nx)} ${r1(ay + dy * 0.25 - ny)} ${r1(ax)} ${r1(ay)}`
  )
}

/** A small open rose: a loose spiral of cubic arcs. */
export function rose(cx: number, cy: number, r: number, turn = 0): string {
  const pts: Pt[] = []
  const steps = 9
  for (let k = 0; k <= steps; k++) {
    const a = turn + k * 1.25
    const rr = r * (0.18 + (0.82 * k) / steps)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9])
  }
  let out = `M${r1(pts[0][0])} ${r1(pts[0][1])}`
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]
    const b = pts[k]
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    const ox = mx - cx
    const oy = my - cy
    out += ` Q${r1(cx + ox * 1.35)} ${r1(cy + oy * 1.35)} ${r1(b[0])} ${r1(b[1])}`
  }
  return out
}

/**
 * Approximate parallel curve: shifts each segment's control points along the
 * local normals (good for gentle curves — borders, hems, double lines).
 * Positive dist offsets to the left of travel direction.
 */
export function offset(d: string, dist: number): string {
  const norm = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    return [(dy / len) * dist, (-dx / len) * dist]
  }
  let out = ''
  for (const sub of parse(d)) {
    sub.forEach((s, si) => {
      const p = s.pts
      const last = p.length - 1
      const n0 = norm(p[0], p[1][0] === p[0][0] && p[1][1] === p[0][1] ? p[Math.min(2, last)] : p[1])
      const n1 = norm(p[last - 1][0] === p[last][0] && p[last - 1][1] === p[last][1] ? p[Math.max(0, last - 2)] : p[last - 1], p[last])
      const q = p.map((pt, k) => {
        const n = k <= last / 2 ? n0 : n1
        return [r1(pt[0] + n[0]), r1(pt[1] + n[1])] as Pt
      })
      if (si === 0) out += `${out ? ' ' : ''}M${q[0][0]} ${q[0][1]}`
      const cmd = p.length === 2 ? 'L' : p.length === 3 ? 'Q' : 'C'
      out += ` ${cmd}${q
        .slice(1)
        .map((v) => `${v[0]} ${v[1]}`)
        .join(' ')}`
    })
  }
  return out
}

/** Curl the part of a shape above y0 sideways (x += k·(y0−y)²) — gives fingers a graceful bend. */
export function bend(d: string, k: number, y0 = 0): string {
  let isX = true
  let lastX = 0
  const nums: number[] = []
  d.replace(/-?\d*\.?\d+/g, (t) => {
    nums.push(Number(t))
    return t
  })
  let idx = 0
  return d.replace(/[MLQCZ]|-?\d*\.?\d+/gi, (tok) => {
    if (/[MLQCZ]/i.test(tok)) {
      isX = true
      return tok
    }
    const i = idx++
    let out: number
    if (isX) {
      const y = nums[i + 1]
      lastX = Number(tok) + (y < y0 ? k * (y0 - y) * (y0 - y) : 0)
      out = lastX
    } else out = Number(tok)
    isX = !isX
    return String(r1(out))
  })
}
