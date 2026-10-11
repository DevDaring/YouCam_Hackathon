import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronRight, Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ARCH_INNER, archMarks, BRIDE_COUNT, getBride } from './hero/brides'
import { FlowerSouls } from './hero/FlowerSouls'
import { LineArt } from './hero/LineArt'

/**
 * Hero artwork: original line-art brides from six traditions, sketched live
 * under a jharokha arch. Loop per bride: pen draws → "flower souls" shower and
 * a warm bloom → the figure dissolves → the next bride is drawn.
 *
 * Drawing is pure CSS (stroke-dashoffset on pathLength=1), so it costs no JS
 * per frame; the particles are one rAF-driven <canvas>. Everything pauses when
 * the tab is hidden or the hero is off-screen. Reduced motion: the Bengali
 * bride is shown complete and static, with a "next bride" button.
 */

const ARCH = archMarks()
const SOULS_SECONDS = 2.9
const OUT_SECONDS = 0.9
const HOLD_SECONDS = 0.5
const FIRST_OFFSET = 0.7

type Phase = 'draw' | 'souls' | 'out'

const THEME = { light: '#7A1F33,#B8913E,#C9A24D,#B3364A,#FCE3B4,#FFF6E8,#FFF9F0,0', dark: '#F6EBDD,#E2BE6A,#C9A24D,#F08A9A,#4A2A1E,#2B1820,#22131A,1' }
const vars = (csv: string) =>
  csv
    .split(',')
    .map((v, i) => `--hb-${['ink', 'gold', 'frame', 'rose', 'g0', 'g1', 'g2', 'dark'][i]}:${v}`)
    .join(';')

const STYLE = `
.hb-root{${vars(THEME.light)}}
:root[data-theme="dark"] .hb-root{${vars(THEME.dark)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .hb-root{${vars(THEME.dark)}}}
.hb-root path{stroke-linecap:round;stroke-linejoin:round}
.hb-ink{stroke:var(--hb-ink)}.hb-soft{stroke:var(--hb-ink);stroke-opacity:.5}.hb-gold{stroke:var(--hb-gold)}.hb-rose{stroke:var(--hb-rose)}
.hb-ink-fill{fill:var(--hb-ink)}.hb-soft-fill{fill:var(--hb-ink);fill-opacity:.5}.hb-gold-fill{fill:var(--hb-gold)}.hb-rose-fill{fill:var(--hb-rose)}
.hb-frame .hb-gold{stroke:var(--hb-frame)}.hb-frame .hb-gold-fill{fill:var(--hb-frame)}
.hb-nostroke{stroke:none}
.hb-draw{stroke-dasharray:1 1;animation:hb-draw var(--d) cubic-bezier(.45,.05,.3,1) var(--t) both}
.hb-draw.hb-fillin{animation:hb-draw var(--d) cubic-bezier(.45,.05,.3,1) var(--t) both,hb-fillin var(--d) ease-out var(--t) both}
.hb-pop{transform-box:fill-box;transform-origin:center;animation:hb-pop .4s cubic-bezier(.3,1.5,.5,1) var(--t) both}
@keyframes hb-draw{0%{stroke-dashoffset:1;opacity:0}1%{opacity:1}100%{stroke-dashoffset:0;opacity:1}}
@keyframes hb-fillin{from{fill-opacity:0}to{fill-opacity:1}}
@keyframes hb-pop{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
.hb-paused *{animation-play-state:paused!important}
.hb-bride{transition:opacity ${OUT_SECONDS}s ease,transform ${OUT_SECONDS}s ease}
.hb-out{opacity:0;transform:translateY(-5px)}
`

export function HeroIllustration() {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const paper = `hb-paper-${uid}`
  const clip = `hb-clip-${uid}`

  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('draw')
  const [run, setRun] = useState(0)
  const [first, setFirst] = useState(true)
  const [paused, setPaused] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden)

  const autoplay = !reduced && !paused
  const running = autoplay && onScreen && tabVisible
  const [archAnimated] = useState(autoplay)

  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FlowerSouls | null>(null)
  const leftRef = useRef<number | null>(null)
  const burstRef = useRef('')

  const bride = getBride(idx)
  const offset = first && idx === 0 ? FIRST_OFFSET : 0
  const name = t(`landing.brides.${bride.id}`)

  // Pause when scrolled away or the tab is hidden.
  useEffect(() => {
    const el = rootRef.current
    const onVis = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    let io: IntersectionObserver | undefined
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.05 })
      io.observe(el)
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      io?.disconnect()
    }
  }, [])

  // Phase clock, resumable: remembers time left when paused mid-phase.
  useEffect(() => {
    if (!running) return
    const total = phase === 'draw' ? bride.drawTime + offset + HOLD_SECONDS : phase === 'souls' ? SOULS_SECONDS : OUT_SECONDS
    const left = leftRef.current ?? total
    const t0 = performance.now()
    let fired = false
    const id = window.setTimeout(() => {
      fired = true
      leftRef.current = null
      if (phase === 'draw') setPhase('souls')
      else if (phase === 'souls') setPhase('out')
      else {
        setIdx((i) => (i + 1) % BRIDE_COUNT)
        setPhase('draw')
        setFirst(false)
      }
    }, left * 1000)
    return () => {
      window.clearTimeout(id)
      if (!fired) leftRef.current = Math.max(0, left - (performance.now() - t0) / 1000)
    }
  }, [running, phase, idx, run, bride.drawTime, offset])

  // One shower of flower souls per bride, as her drawing completes.
  useEffect(() => {
    const key = `${idx}-${run}-${first}`
    if (phase !== 'souls' || !running || burstRef.current === key) return
    burstRef.current = key
    const canvas = canvasRef.current
    if (!canvas) return
    engineRef.current ??= FlowerSouls.create(canvas)
    engineRef.current?.resize()
    engineRef.current?.burst()
    // Prepare the next bride's paths while this one is being showered.
    const t = window.setTimeout(() => getBride((idx + 1) % BRIDE_COUNT), 400)
    return () => window.clearTimeout(t)
  }, [phase, running, idx, run, first])

  useEffect(() => {
    engineRef.current?.setActive(running)
    if (!autoplay) engineRef.current?.clear()
  }, [running, autoplay])

  useEffect(() => {
    const onResize = () => engineRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      engineRef.current?.destroy()
    }
  }, [])

  const next = useCallback(() => {
    leftRef.current = null
    setIdx((i) => (i + 1) % BRIDE_COUNT)
    setPhase('draw')
    setFirst(false)
    setRun((r) => r + 1)
  }, [])

  const togglePause = useCallback(() => {
    leftRef.current = null
    setPhase('draw')
    setFirst(false)
    setRun((r) => r + 1)
    setPaused((p) => !p)
  }, [])

  const btn =
    'grid size-10 place-items-center rounded-full border border-rule/50 bg-surface-raised/85 text-heading shadow-sm backdrop-blur transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus)]'

  return (
    <div ref={rootRef} className="hb-root">
      <style>{STYLE}</style>
      <div className="relative overflow-hidden rounded-[2rem] border border-rule/60 shadow-xl shadow-[color:var(--glow)]" style={{ background: 'var(--hb-g2)' }}>
        <svg
          viewBox="0 0 320 420"
          role="img"
          aria-label={t('landing.brides.alt', { bride: name })}
          className={`block h-auto w-full${running ? '' : ' hb-paused'}`}
        >
          <defs>
            <radialGradient id={paper} gradientUnits="userSpaceOnUse" cx="160" cy="190" r="240">
              <stop offset="0" style={{ stopColor: 'var(--hb-g0)' }} />
              <stop offset="0.55" style={{ stopColor: 'var(--hb-g1)' }} />
              <stop offset="1" style={{ stopColor: 'var(--hb-g2)' }} />
            </radialGradient>
            <clipPath id={clip}>
              <path d={`${ARCH_INNER} Z`} />
            </clipPath>
          </defs>
          <rect width="320" height="420" fill={`url(#${paper})`} />
          <g className="hb-frame">
            <LineArt marks={ARCH} animate={archAnimated} paper={paper} />
          </g>
          <g clipPath={`url(#${clip})`}>
            <g transform="translate(0 10)">
              <g key={`${idx}-${run}`} className={`hb-bride${phase === 'out' && autoplay ? ' hb-out' : ''}`}>
                <LineArt marks={bride.marks} animate={autoplay} offset={offset} paper={paper} />
              </g>
            </g>
          </g>
        </svg>
        {!reduced && <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />}
        <div className="absolute bottom-3 right-3 flex gap-2">
          {!reduced && (
            <button type="button" onClick={togglePause} className={btn} aria-label={t(paused ? 'landing.brides.play' : 'landing.brides.pause')}>
              {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
            </button>
          )}
          {!autoplay && (
            <button type="button" onClick={next} className={btn} aria-label={t('landing.brides.next')}>
              <ChevronRight aria-hidden="true" className="size-5 rtl:rotate-180" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 text-center" aria-live={autoplay ? 'off' : 'polite'}>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted">{t('landing.brides.label')}</p>
        <div className="relative h-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={bride.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="font-display text-xl text-heading"
            >
              {name}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
