import { along, bend, mirror, offset, petal, place, ring, rose, rotate, scallops, wave } from './geometry'
import { schedule, Sketch, type Mark } from './sketch'

/**
 * Original line-art brides for the DearYou hero, drawn for this app.
 * Each tradition is told only through attire and jewellery — no religious
 * symbols as decoration. ViewBox 0 0 320 420; centre line x = 160.
 */

export type BrideId = 'bengali' | 'christian' | 'muslim' | 'jewish' | 'sikh' | 'kandyan'

export interface Bride {
  id: BrideId
  marks: Mark[]
  /** Seconds until the last stroke lands. */
  drawTime: number
}

/* ------------------------------------------------------------------ */
/* Shared anatomy                                                      */
/* ------------------------------------------------------------------ */

const FACE = 'M135 146 C134 166 138 184 148 196 C152 201 156 205 160 205.5 C164 205 168 201 172 196 C182 184 186 166 185 146'

function face(k: Sketch, { brows = true }: { brows?: boolean } = {}) {
  k.s(FACE, 1.7)
  if (brows) k.pair('M139 153.5 C143 150 149 149.5 154.5 151.8', 1.2)
  // Closed, downcast eyes with a lash flick.
  k.pair('M140.5 163.5 C144 167 150.5 167.5 155 164', 1.6)
  k.pair('M141.2 164.6 C140.2 165.6 139.2 166.2 138 166.4', 1.1)
  // A hint of nose and lips.
  k.s('M160.6 170 C161.6 175.5 163.2 179.6 161.7 182.3 C160.4 184 157.8 184 156.2 182.8', 1.2, 'soft')
  k.s('M151.5 193.6 C155 194.8 165 194.8 168.5 193.6', 1.3, 'rose')
  k.s('M152.5 193.2 C155 191.6 157.4 191.2 160 192.6 C162.6 191.2 165 191.6 167.5 193.2', 1.1, 'rose')
  k.s('M154 196.2 C157 199 163 199 166 196.2', 1.1, 'rose')
}

function neck(k: Sketch) {
  k.pair('M147.5 197 C148.4 210 147.4 222 143 232', 1.6)
}

/** Shoulders down into the upper arms. */
function shoulders(k: Sketch, drop = 296) {
  k.pair(`M143 232 C130 238 108 243 94 253 C84 261 79 275 77 ${drop}`, 1.9)
}

/** Back of a hand whose fingertips curl over something held (local: fingertips near 0,0). */
const HOLD_HAND =
  'M-20 66 C-18 54 -16 44 -14 36 C-10 24 -6 14 0 6 C3 2 6 -2 8 -6 ' +
  'C11 -9 15 -10 17.6 -8.6 C19.4 -7.4 18.6 -4.6 16.6 -4.4 C13.6 -4.2 11 -3 9.4 -1 ' +
  'C12.6 -2.6 16.8 -2.6 18.6 -0.6 C19.8 1 18.4 3.4 16.4 3 C13.6 2.8 11.4 3.6 10 5 ' +
  'C12.8 4.4 16.4 5 17.4 7.2 C18 9 16.4 10.6 14.6 10 C12.4 9.6 10.6 10.4 9.4 11.6 ' +
  'C8 18 4 26 2 36 C1 46 0 56 -1 66'

/** An open palm, fingers together (local: wrist centre at 0,36, fingertips up). */
const OPEN_HAND =
  'M-6 36 C-7.6 26 -9 16 -9.4 8 C-9.8 2 -10.4 -4 -10.2 -9 C-10 -13 -6.8 -13.4 -6.4 -9.6 ' +
  'C-6.6 -15 -6.8 -21 -6.4 -25 C-6 -29 -2.4 -29 -2 -25.2 C-2 -29 -1.8 -33 -1.2 -35.6 C-0.4 -39.4 3.4 -39 3.6 -35.2 ' +
  'C3.8 -32 3.8 -29 3.6 -26.4 C4.2 -30 7.8 -29.6 8 -25.8 C8.4 -19 8.2 -11 8.6 -5 C10.8 -7.6 13 -10.6 15 -13 ' +
  'C16.6 -15 19.4 -13.8 18.6 -11.2 C17 -6 14.2 0 12 6 C10.6 11 9.6 16 9 24 C8.6 29 8.6 33 8.8 36'
const OPEN_HAND_LINES = ['M-6.4 -9.6 C-6.2 -6 -6 -3 -6.2 -1', 'M-2 -25.2 C-1.8 -19 -1.8 -12 -1.8 -6', 'M3.6 -26.4 C3.4 -20 3.2 -13 3 -7']

/** Open hand placed with its wrist at (wx, wy), scaled and turned; returns transformed path. */
function posed(d: string, wx: number, wy: number, sc: number, deg: number, curl = 0, sx = 1): string {
  return rotate(place(bend(d, curl, 6), wx, wy - 36 * sc, sc * sx, sc), deg, wx, wy)
}

/** A lace sprig: a curved stem, two leaves and a bud. */
function sprig(k: Sketch, x: number, y: number, s = 1, deg = 0, t: 'ink' | 'soft' = 'soft', l: 0 | 1 | 2 = 1) {
  const tf = (d: string) => rotate(place(d, x, y, s), deg, x, y)
  k.s(tf('M0 0 C1.6 -4 1.6 -8 0 -12'), 0.8, t, l)
  k.s(tf(petal(0.8, -4, -4, -7.5, 1.6)), 0.8, t, l)
  k.s(tf(petal(1, -7.5, 5, -10.5, 1.6)), 0.8, t, l)
  k.s(tf(ring(0, -13.6, 1.6)), 0.8, t, l)
}

/** A hand-drawn garden rose: wrapped petals around a spiral heart. */
function bloom(k: Sketch, x: number, y: number, r: number, l: 0 | 1 | 2 = 2) {
  const P = (dx: number, dy: number) => `${Math.round((x + dx * r) * 10) / 10} ${Math.round((y + dy * r) * 10) / 10}`
  k.s(ring(x, y, r * 1.02, r * 0.92), 0, 'ink', l, true)
  k.s(`M${P(-1, 0.05)} C${P(-1.02, -0.72)} ${P(-0.1, -1.08)} ${P(0.62, -0.74)}`, 1.1, 'ink', l)
  k.s(`M${P(1, -0.2)} C${P(1.06, 0.62)} ${P(0.2, 1.0)} ${P(-0.5, 0.82)}`, 1.1, 'ink', l)
  k.s(`M${P(-0.92, 0.38)} C${P(-0.8, 0.8)} ${P(-0.3, 0.98)} ${P(0.18, 0.94)}`, 0.9, 'ink', l)
  k.s(`M${P(-0.6, 0.12)} C${P(-0.66, -0.42)} ${P(0.1, -0.66)} ${P(0.5, -0.3)}`, 0.9, 'ink', l)
  k.s(`M${P(0.6, -0.05)} C${P(0.62, 0.42)} ${P(0, 0.6)} ${P(-0.4, 0.42)}`, 0.9, 'ink', l)
  k.s(rose(x, y - r * 0.02, r * 0.36, x + y), 0.9, 'rose', l)
}

/** A small woven buti (lotus bud) for saree and dupatta grounds. */
function buti(k: Sketch, x: number, y: number, s = 1, l: 0 | 1 | 2 = 1) {
  k.s(petal(x, y + 2 * s, x, y - 6 * s, 2.2 * s), 0.8, 'gold', l)
  k.s(petal(x, y + 2 * s, x - 4.6 * s, y - 2.6 * s, 1.5 * s), 0.8, 'gold', l)
  k.s(petal(x, y + 2 * s, x + 4.6 * s, y - 2.6 * s, 1.5 * s), 0.8, 'gold', l)
  k.dot(x, y + 4.2 * s, 0.8 * s, 'gold', l)
}

/* ------------------------------------------------------------------ */
/* 1. Bengali bride                                                    */
/* ------------------------------------------------------------------ */

function bengali(): Mark[] {
  const k = new Sketch()

  // Veil (anchal) over the head — soft outer silhouette flowing to the hem.
  const veilL = 'M134 110 C114 113 102 132 100 158 C98 184 97 206 89 228 C81 250 69 268 63 294 C57 320 55 362 50 420'
  const veilR = 'M186 110 C206 113 218 132 220 158 C222 184 225 206 234 228 C243 250 255 272 260 300 C265 330 267 380 270 420'
  k.s(veilL, 2).s(veilR, 2)
  const innerL = 'M128 127 C120 139 117 157 119 177 C121 196 126 212 126 228 C126 238 122 246 116 254 C110 266 106 292 104 322 C102 354 100 390 98 420'
  k.pair(innerL, 1.5)

  face(k)
  k.pair('M160 127.5 C149 128 140.5 133.5 136.5 142 C134.5 146.5 134 151 134.4 156', 1.4)
  k.pair('M131.5 135 C126.5 148 125 164 127 180 C128 188 130 194 132.5 199', 1, 'soft')
  neck(k)
  k.pair('M143 232 C136 236 126 240 117 250', 1.7)

  // Veil folds and zari border.
  k.s('M106 200 C102 240 92 270 82 300 C76 324 72 360 70 400', 1, 'soft', 1)
  k.s('M214 190 C220 226 232 258 244 290 C252 314 256 346 258 380', 1, 'soft', 1)
  k.pair(offset(innerL, -7), 1.2, 'gold', 1)
  k.pair(wave(offset(innerL, -3.5), 30, 1.6, 0.05, 1), 0.85, 'gold', 1)

  for (const [x, y] of [[86, 268], [74, 318], [68, 372], [234, 268], [246, 318], [252, 372], [196, 384], [124, 300]]) buti(k, x, y, 1.1)

  // Benarasi saree: the anchal sweeps up across the chest to her left shoulder.
  const anchal = 'M204 258 C192 300 160 350 116 420'
  k.s(anchal, 1.8, 'ink', 1)
  k.s(offset(anchal, -10), 1.2, 'gold', 1)
  k.s(wave(offset(anchal, -5), 13, 2.4), 0.9, 'gold', 1)
  k.s('M210 300 C200 334 186 366 170 396', 1, 'soft', 1)
  k.s('M126 290 C128 320 126 356 120 390', 1, 'soft', 1)

  // Shola mukut — tall crown with a lace edge, filigree and a lotus medallion.
  const crownSide = 'M125 124 C115 111 114 98 121 88 C128 78 143 72 150 64 C155 58 158 52 160 44'
  k.s(`${crownSide} C162 52 165 58 170 64 C177 72 192 78 199 88 C206 98 205 111 195 124 C183 130 137 130 125 124`, 0, 'ink', 2, true)
  k.pair(crownSide, 1.8, 'ink', 2)
  k.pair(scallops(crownSide, 13, 2.6, 1), 1, 'ink', 2)
  k.pair('M132 120 C125 111 124.5 102 130 95 C136 88 148 83 153 76 C156.5 70.5 158.6 65 160 59', 1.1, 'gold', 2)
  k.s(scallops('M131 108 C145 102 175 102 189 108', 8, 2.2, 1), 0.9, 'gold', 2)
  k.beads('M160 62 L160 78', 3, 0.9, 'gold', 2)
  k.s('M124 128 C137 118 183 118 196 128', 1.9, 'ink', 2)
  k.s('M127 122 C140 112.5 180 112.5 193 122', 1.2, 'gold', 2)
  k.beads('M129 125 C141 116 179 116 191 125', 15, 0.95, 'gold', 2)
  k.s(ring(160, 90, 7), 1.2, 'gold', 2)
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2
    k.s(petal(160 + Math.cos(a) * 8, 90 + Math.sin(a) * 8, 160 + Math.cos(a) * 14.5, 90 + Math.sin(a) * 14.5, 2.4), 0.9, 'ink', 2)
  }
  k.dot(160, 90, 2.1, 'rose')
  k.pair('M139 100 C133 95 135 87 142 87.5 C147 88 148 95 143.5 96.5 C140.5 97.4 139 94 141.6 92.6', 1, 'ink', 2)
  k.dot(160, 40, 1.6, 'gold')

  // Chandan: arcs of dots over the brows, a bindi at the centre.
  k.pairBeads('M137 149.5 C139.5 141 148.5 135.5 157.5 137.2', 8, 0.85, 'ink', 2)
  k.pairBeads('M141.5 151.5 C143.5 146.5 149 143 155.5 143.6', 5, 0.7, 'ink', 2)
  k.dot(160, 145.5, 2.3, 'rose')
  k.dot(160, 139.5, 0.9, 'ink')

  // Nath: a large hoop on her left nostril, chain into the hair.
  k.s(ring(169, 191.5, 10.2), 1.5, 'gold', 2)
  k.beads('M176.6 198.4 C173.6 201.4 168.4 202.4 164 200.6', 4, 1.25, 'gold', 2)
  k.dot(179.2, 190, 1.7, 'rose')
  k.beads('M180.4 188 C188 190 193.6 184 194 172 C194.2 164 192.2 157 189.6 152', 10, 0.75, 'gold', 2)

  // Jhumko earrings.
  for (const x of [130.5, 189.5]) {
    k.dot(x, 180, 1.4, 'gold')
    k.s(`M${x - 5.5} 192 C${x - 5.5} 185 ${x + 5.5} 185 ${x + 5.5} 192 C${x + 2} 193.4 ${x - 2} 193.4 ${x - 5.5} 192`, 1.2, 'gold', 2)
    k.beads(`M${x - 5} 196 C${x - 2} 197.5 ${x + 2} 197.5 ${x + 5} 196`, 4, 0.8, 'gold', 2)
  }

  // Sitahaar: layered necklaces.
  k.s('M147 220 C152 227 168 227 173 220', 1.4, 'gold', 2)
  k.beads('M147.4 223.4 C152 230.6 168 230.6 172.6 223.4', 9, 1, 'gold', 2)
  const h2 = 'M141 234 C143 263 177 263 179 234'
  k.s(h2, 1.3, 'gold', 2)
  for (const { p } of along(h2, 9, 0.12, 0.88)) k.s(petal(p[0], p[1] + 1, p[0], p[1] + 7.5, 2), 0.9, 'gold', 2)
  const h3 = 'M134 239 C136 293 184 293 186 239'
  k.s(h3, 1.3, 'gold', 2)
  k.beads(offset(h3, 3), 15, 1, 'gold', 2, 0.08, 0.92)
  k.s('M160 280 C153 286 153 296 160 303 C167 296 167 286 160 280', 1.3, 'gold', 2)
  k.dot(160, 292, 2, 'rose')
  k.beads('M128 245 C128 320 192 320 192 245', 23, 1.2, 'gold', 2, 0.04, 0.96)

  // Shubho drishti: both hands hold up a paan leaf; shankha-pola at the wrists.
  const leaf = 'M160 314 C150 326 134 336 135 354 C136 370 150 376 160 366 C170 376 184 370 185 354 C186 336 170 326 160 314'
  k.s(leaf, 1.6, 'ink', 1, true)
  k.s('M160 318 C159.4 332 159.6 348 160 366', 0.9, 'soft', 1)
  k.pair('M160 331 C155 333 150 337 146 342', 0.8, 'soft', 1)
  k.pair('M160 345 C156 348 152 352 150 356', 0.8, 'soft', 1)
  k.pair(place(HOLD_HAND, 128, 352), 1.4, 'ink', 1, true)
  k.pair(place('M-13 26.5 C-8.5 30.5 -0.5 32 4.6 30.6', 128, 352), 2.6, 'ink', 2)
  k.pair(place('M-14.6 33.4 C-10 37.4 -2 38.8 3 37.4', 128, 352), 2.6, 'rose', 2)
  k.pair(place('M-12 22 C-8 25 -2 26.4 5.6 25.4', 128, 352), 1, 'gold', 2)

  return k.marks
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 2. Christian bride                                                  */
/* ------------------------------------------------------------------ */

function christian(): Mark[] {
  const k = new Sketch()

  // Tulle veil from the back of the head — wide, sheer, softly gathered.
  const veilL = 'M130 112 C110 118 98 136 92 160 C84 194 78 230 68 262 C58 296 50 340 44 420'
  const veilR = 'M190 112 C212 118 224 136 230 162 C238 196 244 232 254 266 C264 300 272 344 278 420'
  k.s(veilL, 1.7).s(veilR, 1.7)
  k.s(scallops(veilL, 26, 1.8, -1, 0.3, 1), 0.9, 'soft', 1)
  k.s(scallops(veilR, 26, 1.8, 1, 0.3, 1), 0.9, 'soft', 1)

  // Hair: side parting, a soft sweep over the brow, gathered low behind.
  k.s('M148 106 C128 106 116 120 116 140 C116 158 120 174 128 188 C132 196 138 202 145 205', 1.7)
  k.s('M148 106 C172 104 196 116 201 138 C204 154 201 172 193 188 C189 196 182 202 175 205', 1.7)
  k.s('M124 176 C128 186 134 192 141 195', 0.9, 'soft')
  k.s('M197 172 C193 184 187 191 180 195', 0.9, 'soft')
  face(k)
  k.s('M148 118 C140 121 135.5 130 134.5 142 C134 147 134 151 134.4 156', 1.3)
  k.s('M148 118 C162 117 177 122 184 132 C187.5 138 187 146 185.5 153', 1.3)
  k.s('M150 112 C166 110 184 118 192 132 C195 138 196 146 195 152', 0.9, 'soft')
  k.s('M141 112 C130 118 124 130 123 146 C122.6 156 124 166 127 174', 0.9, 'soft')
  k.s('M151 119 C161 125 172 127 181 131', 0.9, 'soft')
  neck(k)
  shoulders(k, 300)

  // Veil gathers and folds.
  k.s('M134 112 C120 140 112 196 100 250 C92 290 84 350 80 420', 1, 'soft', 1)
  k.s('M186 112 C200 140 210 196 222 250 C230 290 238 350 242 420', 1, 'soft', 1)
  k.s('M124 116 C108 150 100 200 88 250', 0.9, 'soft', 1)
  k.s('M196 116 C212 150 220 200 232 250', 0.9, 'soft', 1)

  // Gown: lace illusion yoke, sweetheart bodice, lace sleeves.
  k.s(scallops('M133 246 C145 255 175 255 187 246', 9, 1.6, -1), 1.1, 'ink', 1)
  k.s('M112 300 C120 284 140 282 151 292 C155 296 158 300 160 304 C162 300 165 296 169 292 C180 282 200 284 208 300', 1.6, 'ink', 1)
  k.s(scallops('M112 300 C120 284 140 282 151 292 C155 296 158 300 160 304 C162 300 165 296 169 292 C180 282 200 284 208 300', 18, 1.4, 1), 0.8, 'soft', 1)
  k.pair('M108 300 C104 330 104 370 106 420', 1.5, 'ink', 1)
  k.pair('M77 300 C76 340 78 380 82 420', 1.5, 'ink', 1)
  for (const [x, y, sc, deg] of [[116, 270, 1, -20], [204, 270, 1, 20], [98, 292, 0.9, -30], [222, 292, 0.9, 30], [132, 266, 0.8, 10], [188, 266, 0.8, -10], [92, 340, 1, -10], [228, 340, 1, 10], [90, 392, 0.9, 0], [230, 392, 0.9, 0]])
    sprig(k, x, y, sc, deg)
  k.s('M112 398 C140 392 180 392 208 398', 1.2, 'soft', 1)

  // Tiara and pearls.
  k.s('M126 116 C138 106 182 106 194 116', 1.4, 'gold', 2)
  k.s(scallops('M128 113 C140 103.4 180 103.4 192 113', 9, 2.6, 1), 1, 'gold', 2)
  k.beads('M131 109 C142 100.8 178 100.8 189 109', 9, 0.9, 'gold', 2)
  k.dot(160, 101.5, 2, 'rose')
  for (const x of [131, 189]) {
    k.s(`M${x} 180 L${x} 188`, 0.9, 'gold', 2)
    k.dot(x, 191, 2.2, 'gold')
  }
  k.s('M146 222 C150 238 170 238 174 222', 1, 'gold', 2)
  k.dot(160, 239.5, 2.2, 'gold')

  // A bouquet of garden roses held in both hands, ribbon trailing.
  for (const [ax, ay, bx, by, w] of [[142, 336, 122, 324, 4.4], [178, 336, 198, 324, 4.4], [140, 360, 118, 366, 4.2], [180, 360, 202, 366, 4.2], [152, 326, 146, 308, 3.6], [168, 326, 175, 309, 3.6], [148, 374, 136, 390, 3.8], [172, 374, 184, 390, 3.8]]) {
    k.s(petal(ax, ay, bx, by, w), 1.1, 'ink', 2, true)
    k.s(`M${ax} ${ay} L${(ax + bx * 2) / 3} ${(ay + by * 2) / 3}`, 0.7, 'soft', 2)
  }
  for (const [x, y, r] of [[160, 322, 11], [140, 334, 10.5], [180, 334, 10.5], [150, 352, 11], [170, 352, 11], [160, 338, 10]]) bloom(k, x, y, r)
  for (const [x, y] of [[132, 330], [188, 330], [160, 312], [134, 352], [186, 352], [160, 366]]) k.dot(x, y, 1.3, 'gold')
  k.s('M156 368 C156 378 157 386 158 394 M164 368 C164 378 163 386 162 394', 1, 'soft', 2)
  k.s('M158 378 C150 388 146 400 141 420 M162 378 C170 390 176 402 182 420', 1.2, 'rose', 2)
  k.s('M158 378 C152 374 146 376 147 380 C148 384 154 382 158 378 C164 374 170 376 169 380 C168 384 162 382 158 378', 1, 'rose', 2)
  k.pair(place(HOLD_HAND, 134, 378, 0.95), 1.4, 'ink', 2, true)
  k.pair(place(scallops('M-13 26.5 C-8.5 30.5 -0.5 32 4.6 30.6', 6, 1.2, 1), 134, 378, 0.95), 0.8, 'soft', 2)

  return k.marks
}

/* ------------------------------------------------------------------ */
/* 3. Muslim bride                                                     */
/* ------------------------------------------------------------------ */

function muslim(): Mark[] {
  const k = new Sketch()

  // Outer dupatta over the head, falling to the hem with a heavy border.
  const dupL = 'M160 96 C130 96 108 114 102 146 C96 180 98 210 90 236 C82 262 68 290 62 320 C56 350 54 390 52 420'
  k.s(dupL, 2).s(mirror(dupL), 2)
  k.pair(offset(dupL, -7), 1.2, 'gold', 1)
  k.pair(scallops(offset(dupL, -3.2), 34, 1.4, 1, 0.12, 1), 0.85, 'gold', 1)

  // Hijab: snug around the face, wrapped beneath the chin, falling over the chest.
  const head = 'M160 106 C136 106 118 121 114 146 C110 172 112 196 120 214 C126 228 124 242 114 256'
  k.pair(head, 1.7)
  const frame = 'M160 127 C146 127 135 133.5 131.5 146 C128.6 158 129.6 174 133.6 186 C137.6 198 145.6 208 153.6 213 C157 215 163 215 166.4 213 C174.4 208 182.4 198 186.4 186 C190.4 174 191.4 158 188.5 146 C185 133.5 174 127 160 127'
  face(k)
  k.s(frame, 1.6)
  k.s(offset(frame, -5.5), 1.1, 'gold', 1)
  k.beads(offset(frame, -2.8), 46, 0.75, 'gold', 1, 0, 0.98)
  k.s('M124 222 C134 246 148 258 160 262 C172 258 186 246 196 222', 1.4, 'ink', 1)
  k.s(scallops('M124 222 C134 246 148 258 160 262 C172 258 186 246 196 222', 14, 1.4, -1), 0.9, 'gold', 1)
  k.pair('M118 150 C116 176 118 198 126 214', 0.9, 'soft', 1)

  // Embroidered neckline beneath.
  k.pair('M114 256 C104 268 94 278 84 290', 1.6, 'ink', 1)
  const yoke = 'M104 300 C124 322 196 322 216 300'
  k.s(yoke, 1.5, 'ink', 1)
  k.s(offset(yoke, 9), 1.2, 'gold', 1)
  k.s(wave(offset(yoke, 4.5), 16, 2.6), 0.9, 'gold', 1)
  k.beads(offset(yoke, 13), 21, 1, 'gold', 1, 0.05, 0.95)
  for (const [x, y] of [[100, 344], [220, 344], [160, 350], [180, 382], [214, 396], [156, 404], [196, 352]]) buti(k, x, y, 1.1)
  k.pair('M84 290 C80 320 78 360 78 420', 1.4, 'ink', 1)

  // Passa fanning from the side of the head; tikka at the brow.
  const ax = 180
  const ay = 112
  const fan = (r: number, a0: number, a1: number) => {
    const p = (a: number) => `${(ax + Math.cos((a * Math.PI) / 180) * r).toFixed(1)} ${(ay + Math.sin((a * Math.PI) / 180) * r).toFixed(1)}`
    const m = (a0 + a1) / 2
    const kk = r * 1.06
    return `M${p(a0)} Q${(ax + Math.cos((m * Math.PI) / 180) * kk).toFixed(1)} ${(ay + Math.sin((m * Math.PI) / 180) * kk).toFixed(1)} ${p(a1)}`
  }
  for (let i = 0; i < 7; i++) {
    const a = ((22 + i * 11) * Math.PI) / 180
    const ex = ax + Math.cos(a) * 40
    const ey = ay + Math.sin(a) * 40
    k.beads(`M${ax + Math.cos(a) * 8} ${ay + Math.sin(a) * 8} L${ex} ${ey}`, 7, 0.85, 'gold', 2)
    k.s(petal(ex, ey + 1, ex + Math.cos(a) * 1.5, ey + 8.5, 2.2), 1, 'gold', 2)
  }
  k.s(fan(20, 18, 92), 1.1, 'gold', 2)
  k.s(scallops(fan(30, 18, 92), 9, 1.4, -1), 1, 'gold', 2)
  k.s(ring(ax, ay, 5.2), 1.4, 'gold', 2)
  k.dot(ax, ay, 2, 'rose')
  k.beads('M160 108 L160 124', 4, 0.75, 'gold', 2)
  k.s('M160 125 C155.5 130 156 135 160 138.5 C164 135 164.5 130 160 125', 1.3, 'gold', 2)
  k.dot(160, 132, 1.5, 'rose')

  // A hennaed hand lifted to the chin, gently holding the dupatta's edge.
  const L = (d: string) => posed(d, 128, 318, 1.06, 16, 0, 1.06)
  k.s('M120.6 318.4 C111 346 101 382 93 420 M138.6 323.4 C135 354 131 390 128 420', 1.5, 'ink', 1)
  k.s('M120.6 318.4 C126.6 322.6 132.8 324.2 138.6 323.4', 1.3, 'gold', 1)
  k.s(wave('M119 324.4 C125.4 328.6 132 330.2 137.8 329.4', 4, 1.2), 0.8, 'gold', 1)
  k.s(L(OPEN_HAND), 1.4, 'ink', 2, true)
  for (const d of OPEN_HAND_LINES) k.s(L(d), 0.8, 'soft', 2)
  k.s(L(ring(0, 12, 4)), 0.9, 'rose', 2)
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    k.s(L(petal(Math.cos(a) * 4.6, 12 + Math.sin(a) * 4.6, Math.cos(a) * 8.2, 12 + Math.sin(a) * 8.2, 1.5)), 0.7, 'rose', 2)
  }
  k.s(L('M0.6 -2.4 C-1.6 -6 2 -9.4 0.4 -14 M-4 -14 C-4.2 -18 -3.8 -20 -4 -22 M5.6 -12 C5.8 -16 5.8 -19 5.8 -22'), 0.7, 'rose', 2)
  k.s(L('M-10.2 -7.6 C-9 -6.4 -7.6 -6.4 -6.5 -7.6 M-6.6 -23 C-5 -21.8 -3.4 -21.8 -2 -23 M-1.6 -33.4 C0 -32.2 2 -32.2 3.6 -33.4 M3.8 -24.4 C5 -23.2 6.8 -23.2 8 -24.4'), 0.9, 'rose', 2)
  k.s(L('M12 -6 C13.6 -8 15 -10 16.4 -11.6'), 0.8, 'rose', 2)
  k.s(L(scallops('M-8.6 26 C-3 28 4 28 8.8 26', 6, 1.3, -1)), 0.8, 'rose', 2)
  k.s(L('M-8.8 31 C-3 33.4 4 33.4 9 31'), 2, 'gold', 2)

  return k.marks
}

/* ------------------------------------------------------------------ */
/* 4. Jewish bride                                                     */
/* ------------------------------------------------------------------ */

function jewish(): Mark[] {
  const k = new Sketch()

  // A hint of the chuppah: canopy drapes gathered at the sides of the arch.
  k.pair('M50 132 C66 170 76 214 64 252 C58 276 58 340 62 420', 1, 'soft', 0)
  k.pair('M62 112 C84 156 96 210 74 250', 1, 'soft', 0)
  k.pair('M74 102 C100 140 110 186 96 226 C90 240 80 248 72 252', 0.9, 'soft', 0)
  k.pair(ring(70, 254, 3.2), 1, 'gold', 0)
  k.pair('M68 258 C64 268 66 280 70 290 M72 258 C76 270 76 282 74 292', 0.9, 'gold', 0)

  // Long veil falling from the floral crown.
  const veilL = 'M128 116 C108 124 98 146 94 172 C90 204 86 236 76 268 C68 296 62 344 60 420'
  k.s(veilL, 1.7).s(mirror(veilL), 1.7)
  k.pair(offset(veilL, -4), 0.8, 'soft', 1)
  k.pair('M126 128 C114 156 110 200 102 244 C98 270 92 320 90 420', 0.9, 'soft', 1)

  // Hair: centre parting, soft waves to the shoulders.
  face(k)
  k.pair('M160 127.5 C149 128 140.5 133.5 136.5 142 C134.5 146.5 134 151 134.4 156', 1.4)
  k.pair('M160 112 C140 112 124 124 120 146 C117 166 120 186 118 204 C116 222 110 236 104 250 C100 260 102 270 110 274', 1.6)
  k.pair('M134.4 170 C132 190 132 206 128 222 C125 234 122 246 124 258', 1.2)
  k.pair('M127 150 C124 168 126 186 124 200 C122 214 117 226 114 236', 0.9, 'soft')
  neck(k)
  shoulders(k, 300)

  // Modest lace gown: high collar, lace yoke, buttons, long sleeves.
  k.s(scallops('M146.6 212 C152 217 168 217 173.4 212', 7, 1.3, 1), 1.1, 'ink', 1)
  k.s('M146.6 212 C152 217 168 217 173.4 212', 0.8, 'soft', 1)
  k.beads('M148 220 C154 224 166 224 172 220', 5, 0.7, 'soft', 1)
  k.s(scallops('M118 248 C136 262 184 262 202 248', 12, 2, -1), 1.1, 'ink', 1)
  k.beads('M160 236 L160 330', 9, 1.1, 'ink', 1)
  k.pair('M106 300 C104 330 104 370 108 420', 1.4, 'ink', 1)
  k.pair('M77 300 C76 340 78 380 82 420', 1.5, 'ink', 1)
  for (const [x, y, sc, deg] of [[132, 242, 0.8, -40], [188, 242, 0.8, 40], [118, 286, 1, -20], [202, 286, 1, 20], [140, 300, 0.9, 10], [180, 300, 0.9, -10], [92, 336, 1, -8], [228, 336, 1, 8], [94, 384, 0.9, 6], [226, 384, 0.9, -6]])
    sprig(k, x, y, sc, deg)
  k.pair('M132 300 C138 330 140 370 136 420', 1, 'soft', 1)
  k.s('M118 384 C140 378 180 378 202 384', 1, 'soft', 1)
  k.s(scallops('M118 390 C140 384 180 384 202 390', 12, 1.4, -1), 0.9, 'ink', 1)
  k.beads('M120 380 C140 374 180 374 200 380', 13, 0.7, 'gold', 1)

  // Crown of small flowers and leaves; pearl drops.
  const crown = 'M124 128 C130 110 190 110 196 128'
  for (const { p, tan } of along(crown, 9)) {
    k.s(petal(p[0], p[1], p[0] - tan[1] * 9 + tan[0] * 4, p[1] + tan[0] * 9 * -1 + tan[1] * 4, 2.4), 0.9, 'gold', 2)
  }
  for (const { p } of along(crown, 7, 0.06, 0.94)) {
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5 - Math.PI / 2
      k.s(petal(p[0], p[1], p[0] + Math.cos(a) * 5.6, p[1] + Math.sin(a) * 5.6, 2.2), 1, 'ink', 2, true)
    }
    k.dot(p[0], p[1], 1.3, 'rose')
  }
  for (const x of [131, 189]) {
    k.s(`M${x} 180 L${x} 186`, 0.9, 'gold', 2)
    k.dot(x, 189, 2.1, 'gold')
  }

  return k.marks
}

/* ------------------------------------------------------------------ */
/* 5. Sikh bride                                                       */
/* ------------------------------------------------------------------ */

function sikh(): Mark[] {
  const k = new Sketch()

  // Chunni over the head with a gota-patti border.
  const outL = 'M160 98 C132 98 112 114 106 142 C100 172 102 204 94 232 C86 260 72 290 66 324 C61 352 58 392 56 420'
  k.s(outL, 2).s(mirror(outL), 2)
  const inL = 'M160 112 C142 112 128 122 124 140 C120 158 122 178 126 194 C130 210 128 226 120 242 C112 258 106 290 104 330 C103 360 102 390 102 420'
  k.pair(inL, 1.5)
  k.pair(offset(inL, -7), 1.1, 'gold', 1)
  for (const side of [inL, mirror(inL)]) {
    const flip = side === inL ? 1 : -1
    for (const { p, tan } of along(offset(side, -3.5 * flip), 22, 0.04, 0.98)) {
      k.s(petal(p[0], p[1], p[0] + tan[0] * 5.4, p[1] + tan[1] * 5.4, 1.6), 0.8, 'gold', 1)
    }
  }
  k.pair(offset(outL, -5), 1, 'gold', 1)
  for (const [x, y] of [[84, 290], [76, 344], [72, 396], [236, 290], [244, 344], [248, 396]]) buti(k, x, y, 1.1)

  face(k)
  k.pair('M160 127.5 C149 128 140.5 133.5 136.5 142 C134.5 146.5 134 151 134.4 156', 1.4)
  k.pair('M131 132 C127 146 126 162 128 178 C129 186 131 192 133.5 197', 1, 'soft')
  neck(k)
  k.pair('M143 232 C136 236 128 240 122 244', 1.6)

  // Suit neckline with embroidery.
  const neckline = 'M136 244 C142 278 178 278 184 244'
  k.s(neckline, 1.4, 'ink', 1)
  k.s(offset(neckline, -6), 1, 'gold', 1)
  k.beads(offset(neckline, -3), 15, 0.9, 'gold', 1, 0.05, 0.95)

  // Maang tikka along the parting.
  k.beads('M160 112 L160 128', 5, 0.8, 'gold', 2)
  k.s(ring(160, 133.6, 4.4), 1.4, 'gold', 2)
  k.dot(160, 133.6, 1.7, 'rose')
  k.s(petal(160, 138.4, 160, 146, 2.2), 1, 'gold', 2)
  k.beads('M155.4 135.6 C156.6 140.6 163.4 140.6 164.6 135.6', 5, 0.7, 'gold', 2)

  // Nath with a pearl cluster and a chain to the hair.
  k.s(ring(174, 192.5, 13.6), 1.3, 'gold', 2)
  for (const [x, y] of [[176, 206.2], [171.6, 205.6], [180.4, 205]]) k.dot(x, y, 1.6, 'ink')
  k.dot(176, 206.2, 0.9, 'gold')
  k.beads('M187 189 C195 186 199 176 196 164 C194.4 158 192 154 189 151', 10, 0.75, 'gold', 2)

  // Jhumkas and a choker.
  for (const x of [131, 189]) {
    k.dot(x, 180, 1.5, 'gold')
    k.s(`M${x - 6.5} 194 C${x - 6.5} 186 ${x + 6.5} 186 ${x + 6.5} 194 C${x + 2.5} 195.6 ${x - 2.5} 195.6 ${x - 6.5} 194`, 1.3, 'gold', 2)
    k.beads(`M${x - 6} 198.4 C${x - 2} 200.4 ${x + 2} 200.4 ${x + 6} 198.4`, 5, 0.85, 'gold', 2)
  }
  k.s('M146.6 221 C152 228.6 168 228.6 173.4 221', 1.5, 'gold', 2)
  for (const { p } of along('M146.6 221 C152 228.6 168 228.6 173.4 221', 7, 0.1, 0.9)) k.s(petal(p[0], p[1] + 0.6, p[0], p[1] + 7, 1.9), 0.9, 'gold', 2)

  // Joined hands (pranam); chooda on the forearms, kaleere swinging from the wrists.
  const H = (d: string) => place(d, 160, 282, 1.22)
  k.s(H('M0 0.5 C-2.6 1 -4.4 3 -5 5.8 C-6 6.2 -7 7 -7.6 8.8 C-8.6 13 -8.6 22 -8.2 30 C-8 33 -9 36 -10 38 C-11.4 44 -11.6 52 -10.6 62 L10.6 62 C11.6 52 11.4 44 10 38 C9 36 8 33 8.2 30 C8.6 22 8.6 13 7.6 8.8 C7 7 6 6.2 5 5.8 C4.4 3 2.6 1 0 0.5'), 1.4, 'ink', 2, true)
  k.s(H('M0 3.4 L0 27'), 0.7, 'soft', 2)
  k.pair(H('M-9.6 37.4 C-8 33 -5.4 29.6 -2.8 28.4 C-1.1 27.8 -0.2 29 -0.5 30.6 C-1.2 34 -2.2 38 -2.6 44'), 1.1, 'ink', 2)
  k.pair(H('M-4.8 8 C-3.8 9 -2.6 9.2 -1.4 8.8'), 0.6, 'soft', 2)
  const axis = { x: -5.5, y: 64, dx: -0.5, dy: 0.866 }
  const px = 0.866
  const py = 0.5
  k.pair(H('M-10.6 62 C-18 76 -30 94 -44 116 M0 66 C-8 80 -18 98 -30 124'), 1.5, 'ink', 1)
  for (let i = 0; i < 10; i++) {
    const t = 4 + i * 3.2
    const cx = axis.x + axis.dx * t
    const cy = axis.y + axis.dy * t
    const w = 7.4 + i * 0.12
    const a = [cx - px * w, cy - py * w]
    const b = [cx + px * w, cy + py * w]
    const c = [cx + axis.dx * 3.2, cy + axis.dy * 3.2]
    const gold = i === 0 || i === 9 || i === 5
    k.pair(H(`M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`), gold ? 1.3 : 1.5, gold ? 'gold' : 'rose', 2)
  }
  for (const [dx, len] of [[-8, 12], [-2.5, 19], [3, 9]]) {
    const x0 = -15 + dx
    const y0 = 68 + dx * 0.8
    const kal = `M${x0} ${y0} L${x0} ${y0 + len}`
    k.pairBeads(H(kal), Math.round(len / 3.6), 0.7, 'gold', 2)
    const yb = y0 + len
    k.pair(H(`M${x0 - 5} ${yb + 6} C${x0 - 5} ${yb - 0.6} ${x0 + 5} ${yb - 0.6} ${x0 + 5} ${yb + 6} C${x0 + 2} ${yb + 4.6} ${x0 - 2} ${yb + 4.6} ${x0 - 5} ${yb + 6}`), 1.1, 'gold', 2, true)
    k.pairBeads(H(`M${x0 - 4.4} ${yb + 9.4} L${x0 + 4.4} ${yb + 9.4}`), 3, 0.8, 'gold', 2)
  }

  return k.marks
}

/* ------------------------------------------------------------------ */
/* 6. Kandyan bride (Sri Lanka)                                        */
/* ------------------------------------------------------------------ */

function kandyan(): Mark[] {
  const k = new Sketch()

  // Hair drawn smoothly back from a centre parting.
  k.pair('M160 106 C140 106 124 118 120 140 C117 158 119 176 125 190', 1.8)
  face(k)
  k.pair('M160 126 C148 126.5 139.5 133 136 142 C134.5 146.5 134 151 134.4 156', 1.4)
  k.pair('M150 110 C136 114 127 126 125 142 C124 154 125 166 128 176', 0.9, 'soft')
  neck(k)
  k.s(scallops('M134 246 C146 258 174 258 186 246', 8, 1.4, -1), 1, 'ink', 1)

  // Osariya jacket: gathered puff sleeves; the pallu falls from her left shoulder.
  shoulders(k, 262)
  for (const side of [0, 1]) {
    const f = (d: string) => (side ? mirror(d) : d)
    k.s(f('M120 242 C102 238 86 248 81 264 C78 276 82 288 92 292 C100 295 108 292 113 287'), 1.5, 'ink', 1)
    k.s(f(scallops('M84 290 C92 296 104 296 112 290', 4, 1.4, 1)), 0.9, 'ink', 1)
    k.s(f('M112 244 C100 250 92 262 90 276 M104 242 C94 248 87 258 85 270 M118 248 C110 256 104 268 104 282'), 0.8, 'soft', 1)
    k.s(f('M86 292 C81 330 82 380 88 420 M110 291 C106 330 108 380 114 420'), 1.4, 'ink', 1)
  }
  const pallu = 'M188 240 C196 280 198 330 192 372 C189 392 188 406 188 420'
  k.s(pallu, 1.5, 'ink', 1)
  k.s(offset(pallu, -5), 1.1, 'gold', 1)
  k.s(wave(offset(pallu, -9.5), 14, 1.8), 0.8, 'gold', 1)
  k.s(offset(pallu, -14), 1.1, 'gold', 1)
  k.s('M204 246 C212 286 214 334 210 376 C208 396 208 410 209 420', 1.4, 'ink', 1)
  k.s('M198 270 C204 310 205 350 201 390', 0.8, 'soft', 1)
  // The waist frill (pota).
  const frill = 'M104 376 C132 384 188 384 216 376'
  k.s(frill, 1.4, 'ink', 1)
  k.s(scallops('M100 396 C130 405 190 405 220 396', 14, 2.4, -1), 1.1, 'ink', 1)
  for (const { p } of along(frill, 13, 0.04, 0.96)) k.s(`M${p[0].toFixed(1)} ${(p[1] + 2).toFixed(1)} C${(p[0] - 1).toFixed(1)} ${(p[1] + 8).toFixed(1)} ${(p[0] - 1.6).toFixed(1)} ${(p[1] + 13).toFixed(1)} ${(p[0] - 1.4).toFixed(1)} ${(p[1] + 18).toFixed(1)}`, 0.8, 'soft', 1)
  k.beads('M106 382 C134 390 186 390 214 382', 17, 0.8, 'gold', 1)

  // Nalal patiya across the brow; headdress radiating over the crown.
  const nalal = 'M134 152 C137 134 148 126.5 160 126.5 C172 126.5 183 134 186 152'
  k.s(nalal, 1.3, 'gold', 2)
  k.beads(offset(nalal, -2.6), 17, 0.9, 'gold', 2, 0.03, 0.97)
  for (const { p } of along(nalal, 7, 0.12, 0.88)) k.s(petal(p[0], p[1] + 0.8, p[0], p[1] + 6.4, 1.6), 0.8, 'gold', 2)
  k.s(petal(160, 127, 160, 141, 3.4), 1.2, 'gold', 2)
  k.dot(160, 134.6, 1.6, 'rose')
  const diadem = 'M126 122 C136 104 184 104 194 122'
  k.s(diadem, 1.5, 'gold', 2)
  for (const { p, tan } of along(diadem, 13)) {
    const nx = tan[1]
    const ny = -tan[0]
    k.s(petal(p[0], p[1], p[0] + nx * 10, p[1] + ny * 10, 2.4), 1, 'gold', 2)
  }
  k.s(ring(160, 94, 6), 1.3, 'gold', 2)
  k.dot(160, 94, 2.2, 'rose')
  for (const x of [125, 195]) {
    k.s(ring(x, 150, 4.6), 1.2, 'gold', 2)
    k.dot(x, 150, 1.6, 'gold')
    k.s(`M${x} 156 L${x} 166`, 0.8, 'gold', 2)
    k.dot(x, 184, 1.4, 'gold')
    k.s(`M${x - 4} 190 C${x - 4} 196 ${x + 4} 196 ${x + 4} 190 C${x + 1.5} 189 ${x - 1.5} 189 ${x - 4} 190`, 1.1, 'gold', 2)
  }

  // Seven layered necklaces, each a different weave.
  const chain = (y: number, spread: number) => {
    const s0 = 14 + spread * 0.1
    const y0 = 226 + spread * 0.1
    const m = y0 + (y - y0) * 0.4
    return `M${160 - s0} ${y0} C${160 - spread} ${m} ${160 - spread * 0.72} ${y} 160 ${y} C${160 + spread * 0.72} ${y} ${160 + spread} ${m} ${160 + s0} ${y0}`
  }
  k.s('M147 221 C152 228 168 228 173 221', 1.6, 'gold', 2)
  k.beads('M147.4 224.6 C152 231.6 168 231.6 172.6 224.6', 9, 1.1, 'gold', 2)
  k.s(chain(246, 18), 1.1, 'gold', 2)
  for (const { p } of along(chain(246, 18), 9, 0.15, 0.85)) k.dot(p[0], p[1] + 1.6, 1.6, 'gold')
  k.s(chain(268, 24), 1.1, 'gold', 2)
  for (const { p } of along(chain(268, 24), 11, 0.14, 0.86)) k.s(petal(p[0], p[1] + 0.6, p[0], p[1] + 6.6, 1.8), 0.9, 'gold', 2)
  k.beads(chain(292, 30), 25, 1.05, 'gold', 2, 0.1, 0.9)
  k.s(chain(318, 36), 1.1, 'gold', 2)
  k.s(ring(160, 321, 6.4), 1.3, 'gold', 2)
  k.dot(160, 321, 2.4, 'rose')
  k.beads(chain(346, 40), 31, 1.2, 'gold', 2, 0.12, 0.88)
  k.s(chain(374, 44), 1.1, 'gold', 2)
  for (const { p } of along(chain(374, 44), 9, 0.22, 0.78)) k.s(petal(p[0], p[1] + 0.6, p[0], p[1] + 8, 2.2), 0.9, 'gold', 2)

  return k.marks
}

function build(id: BrideId, draw: () => Mark[]): Bride {
  const marks = draw()
  return { id, marks, drawTime: schedule(marks) }
}

const FACTORIES: [BrideId, () => Mark[]][] = [
  ['bengali', bengali],
  ['christian', christian],
  ['muslim', muslim],
  ['jewish', jewish],
  ['sikh', sikh],
  ['kandyan', kandyan],
]

export const BRIDE_COUNT = FACTORIES.length
const cache: Bride[] = []

/** Builds a bride's paths on first use (a few ms each), then reuses them. */
export function getBride(i: number): Bride {
  return (cache[i] ??= build(...FACTORIES[i]))
}

/* ------------------------------------------------------------------ */
/* The arch (jharokha) frame — drawn once and kept.                    */
/* ------------------------------------------------------------------ */

export const ARCH_OUTER = 'M30 420 L30 192 C30 114 84 72 126 58 C143 52 154 42 160 24 C166 42 177 52 194 58 C236 72 290 114 290 192 L290 420'
export const ARCH_INNER = 'M42 420 L42 194 C42 124 92 86 130 73 C146 67 155 57 160 40 C165 57 174 67 190 73 C228 86 278 124 278 194 L278 420'

export function archMarks(): Mark[] {
  const k = new Sketch()
  k.s(ARCH_OUTER, 1.6, 'gold', 0)
  k.s(ARCH_INNER, 1.1, 'gold', 0)
  k.s(scallops('M42 194 C42 124 92 86 130 73 C146 67 155 57 160 40 C165 57 174 67 190 73 C228 86 278 124 278 194', 22, 2.6, -1), 0.9, 'gold', 0)
  k.s('M160 24 C155.5 18.5 155.5 12.5 160 7 C164.5 12.5 164.5 18.5 160 24', 1.2, 'gold', 0)
  k.pair('M22 194 L50 194 M24 199 L48 199', 1.2, 'gold', 0)
  k.pair('M36 199 C36 206 33 210 36 214 C39 210 36 206 36 199', 1, 'gold', 0)
  schedule(k.marks, 1.8)
  return k.marks
}
