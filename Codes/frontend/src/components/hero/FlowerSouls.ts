/**
 * "Flower souls": a short shower of glowing motes and petals over the hero art.
 *
 * One <canvas>, one requestAnimationFrame loop that only runs while something
 * is on screen. Glows are pre-rendered sprites (drawImage is far cheaper than
 * shadowBlur), the canvas is devicePixelRatio-aware (capped at 2), and the
 * caller pauses it when the tab is hidden or the hero scrolls away.
 */

type Kind = 'soul' | 'petal'

interface Particle {
  kind: Kind
  sprite: number
  x0: number
  x: number
  y: number
  vy: number
  size: number
  swayA: number
  swayW: number
  phase: number
  rot: number
  spin: number
  /** Seconds before it appears. */
  wait: number
  age: number
  /** y (px) where it comes to rest on the figure, or -1 to drift through. */
  rest: number
  restAge: number
  life: number
}

const SOUL_COLOURS = ['#F8CF86', '#F2A93B', '#E0A030', '#FFD88A']
const PETAL_COLOURS = ['#B3364A', '#F2A93B', '#E9788A']
const SHOWER = 58
const BLOOM_SECONDS = 2.8

function makeSprite(colour: string, px: number, dark: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = px
  c.height = px
  const g = c.getContext('2d')
  if (!g) return c
  const r = px / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  if (dark) {
    // On the night ground: a white-hot heart melting into colour.
    grad.addColorStop(0, 'rgba(255,251,240,1)')
    grad.addColorStop(0.18, colour)
    grad.addColorStop(0.45, `${colour}66`)
  } else {
    // On ivory: a saturated heart with a warm halo (white would vanish).
    grad.addColorStop(0, colour)
    grad.addColorStop(0.16, colour)
    grad.addColorStop(0.4, `${colour}55`)
  }
  grad.addColorStop(1, `${colour}00`)
  g.fillStyle = grad
  g.fillRect(0, 0, px, px)
  return c
}

export class FlowerSouls {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private sprites: HTMLCanvasElement[] = []
  private spriteTheme: boolean | null = null
  private parts: Particle[] = []
  private raf = 0
  private last = 0
  private active = true
  private w = 0
  private h = 0
  private dpr = 1
  private bloom = -1
  private dark = false

  private constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas
    this.ctx = ctx
    this.resize()
  }

  /** Returns null where 2D canvas is unavailable (old browsers, test DOMs). */
  static create(canvas: HTMLCanvasElement): FlowerSouls | null {
    try {
      const ctx = canvas.getContext('2d')
      return ctx ? new FlowerSouls(canvas, ctx) : null
    } catch {
      return null
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = rect.width
    this.h = rect.height
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr))
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  /** Start a new shower plus a warm bloom behind the figure. */
  burst(): void {
    this.dark = getComputedStyle(this.canvas).getPropertyValue('--hb-dark').trim() === '1'
    if (this.spriteTheme !== this.dark) {
      this.sprites = [...SOUL_COLOURS, ...PETAL_COLOURS].map((c) => makeSprite(c, 64, this.dark))
      this.spriteTheme = this.dark
    }
    const { w, h } = this
    const scale = w / 320
    for (let i = 0; i < SHOWER; i++) {
      const petal = Math.random() < 0.3
      const settles = Math.random() < 0.42
      const x = w * (0.12 + Math.random() * 0.76)
      this.parts.push({
        kind: petal ? 'petal' : 'soul',
        sprite: petal ? SOUL_COLOURS.length + Math.floor(Math.random() * PETAL_COLOURS.length) : Math.floor(Math.random() * SOUL_COLOURS.length),
        x0: settles ? w * (0.3 + Math.random() * 0.4) : x,
        x,
        y: -12 - Math.random() * 30,
        vy: (h / (2.5 + Math.random() * 1.4)) * (petal ? 0.85 : 1),
        size: (petal ? 3.2 + Math.random() * 2.4 : 1.4 + Math.random() * 2.2) * scale,
        swayA: (6 + Math.random() * 14) * scale,
        swayW: 1 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 3,
        wait: Math.random() * 1.5,
        age: 0,
        rest: settles ? h * (0.42 + Math.random() * 0.5) : -1,
        restAge: 0,
        life: 1,
      })
    }
    this.bloom = 0
    this.kick()
  }

  setActive(on: boolean): void {
    this.active = on
    if (on) this.kick()
    else if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  /** Drop everything (e.g. when switching to reduced motion). */
  clear(): void {
    this.parts = []
    this.bloom = -1
    this.ctx.clearRect(0, 0, this.w, this.h)
  }

  destroy(): void {
    this.setActive(false)
    this.parts = []
  }

  private kick(): void {
    if (!this.active || this.raf || (!this.parts.length && this.bloom < 0)) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number): void => {
    this.raf = 0
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.step(dt)
    this.draw()
    if (this.active && (this.parts.length || this.bloom >= 0)) this.raf = requestAnimationFrame(this.frame)
  }

  private step(dt: number): void {
    if (this.bloom >= 0) {
      this.bloom += dt
      if (this.bloom > BLOOM_SECONDS) this.bloom = -1
    }
    for (const p of this.parts) {
      if (p.wait > 0) {
        p.wait -= dt
        continue
      }
      p.age += dt
      p.rot += p.spin * dt
      if (p.rest > 0 && p.y >= p.rest) {
        // Settled on the figure: hold, shimmer, fade.
        p.restAge += dt
        p.life = Math.max(0, 1 - p.restAge / 1.2)
        continue
      }
      const slow = p.rest > 0 ? Math.max(0.18, Math.min(1, (p.rest - p.y) / (this.h * 0.18))) : 1
      p.y += p.vy * slow * dt
      const drift = p.rest > 0 ? (p.x0 - p.x) * Math.min(1, dt * 1.2) : 0
      p.x += drift + Math.cos(p.age * p.swayW + p.phase) * p.swayA * p.swayW * dt
      if (p.rest < 0 && p.y > this.h * 0.82) p.life = Math.max(0, 1 - (p.y - this.h * 0.82) / (this.h * 0.18))
    }
    this.parts = this.parts.filter((p) => p.life > 0.01 && p.y < this.h + 20)
  }

  private draw(): void {
    const { ctx, w, h } = this
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = this.dark ? 'lighter' : 'source-over'

    if (this.bloom >= 0) {
      const a = Math.sin((Math.PI * this.bloom) / BLOOM_SECONDS)
      const g = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.62)
      g.addColorStop(0, this.dark ? `rgba(248,207,134,${0.22 * a})` : `rgba(248,207,134,${0.3 * a})`)
      g.addColorStop(1, 'rgba(248,207,134,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    for (const p of this.parts) {
      if (p.wait > 0) continue
      const fadeIn = Math.min(1, p.age / 0.35)
      const twinkle = p.kind === 'soul' ? 0.75 + 0.25 * Math.sin(p.age * 7 + p.phase) : 1
      const settledGlow = p.restAge > 0 ? 1 + 0.6 * Math.sin(Math.min(1, p.restAge / 0.5) * Math.PI) : 1
      const alpha = fadeIn * p.life * twinkle
      if (alpha <= 0.01) continue
      const sprite = this.sprites[p.sprite]
      const halo = p.size * (p.kind === 'soul' ? (this.dark ? 7 : 8) : 4.2) * settledGlow
      ctx.globalAlpha = Math.min(1, alpha * (this.dark ? 0.95 : 1.05))
      ctx.drawImage(sprite, p.x - halo / 2, p.y - halo / 2, halo, halo)
      if (p.kind === 'petal') {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = alpha * 0.9
        ctx.fillStyle = PETAL_COLOURS[p.sprite - SOUL_COLOURS.length]
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size, p.size * 0.48, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}
