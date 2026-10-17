import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, clearLookEnhance, enhanceLook, getLooks, patchLayer, retryLook, startLooks, type LayerName, type LayerPatch, type LooksPayload, type Wear } from '../../lib/api'
import { hasOpenLayers, hasRunningEnhance } from './lookUtils'

export const POLL_MS = 3000
/** Polls in a row with queued layers but no running render task before we stop asking. */
const STALL_POLLS = 20
const EVENT_TTL_MS = 3200

/** 'person' = group photo and nobody chosen yet (422 person_required): ask who to dress. */
export type LooksPhase = 'loading' | 'choose' | 'person' | 'starting' | 'ready' | 'error'

/** A layer that just finished (or failed) since the previous payload. */
export interface LayerEvent {
  id: number
  lookId: string
  slot: number
  layer: LayerName
  kind: 'done' | 'failed'
}

export function errorCode(err: unknown): string {
  return err instanceof ApiError && err.detail ? err.detail : 'generic'
}

/**
 * Drives the Look Studio: loads the looks, starts the first round once (StrictMode-safe),
 * polls every few seconds while anything renders (paused while the tab is hidden), and
 * reports layers that finish so the UI can announce them.
 */
export function useLooks(sessionId: string | null) {
  const [payload, setPayload] = useState<LooksPayload | null>(null)
  const [phase, setPhase] = useState<LooksPhase>('loading')
  const [error, setError] = useState<string | null>(null)
  /** Non-blocking problem from a rebuild/retry, shown next to the control. */
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 'wear' | 'replan' | look id being retried
  const [events, setEvents] = useState<LayerEvent[]>([])
  const [nonce, setNonce] = useState(0)
  const [stalled, setStalled] = useState(false)
  const [finished, setFinished] = useState(0) // bumps when a render run goes idle (for announcements)

  const startedFor = useRef<string | null>(null)
  /** The last start request, replayed once the shopper has chosen who to dress. */
  const lastStart = useRef<{ wear?: Wear; replan?: boolean }>({})
  const seen = useRef<Map<string, string> | null>(null) // `${lookId}:${layer}` → status
  const eventId = useRef(0)
  const idleStreak = useRef(0)
  const timers = useRef(new Set<number>())

  useEffect(() => {
    const set = timers.current
    return () => set.forEach((id) => window.clearTimeout(id))
  }, [])

  const apply = useCallback((p: LooksPayload) => {
    const prev = seen.current
    const next = new Map<string, string>()
    const fresh: LayerEvent[] = []
    for (const look of p.looks) {
      for (const l of look.layers) {
        const key = `${look.id}:${l.layer}`
        next.set(key, l.status)
        if (!prev) continue // first load: describe state, don't announce history
        const before = prev.get(key) ?? 'pending'
        if (before !== l.status && (l.status === 'done' || l.status === 'failed')) {
          fresh.push({ id: ++eventId.current, lookId: look.id, slot: look.slot, layer: l.layer, kind: l.status })
        }
      }
    }
    const wasOpen = prev ? [...prev.values()].some((s) => s === 'pending' || s === 'rendering') : false
    seen.current = next
    setPayload(p)

    // Stall guard: queued layers but nothing running on the server for a while → stop polling.
    const queuedOnly = !p.rendering && !p.looks.some((lk) => lk.layers.some((l) => l.status === 'rendering')) && hasOpenLayers(p)
    idleStreak.current = queuedOnly ? idleStreak.current + 1 : 0
    setStalled(idleStreak.current >= STALL_POLLS)

    if (wasOpen && !p.rendering && !hasOpenLayers(p)) setFinished((n) => n + 1)
    if (fresh.length) {
      setEvents((e) => [...e, ...fresh])
      const ids = new Set(fresh.map((f) => f.id))
      const timer = window.setTimeout(() => {
        timers.current.delete(timer)
        setEvents((e) => e.filter((ev) => !ids.has(ev.id)))
      }, EVENT_TTL_MS)
      timers.current.add(timer)
    }
  }, [])

  const start = useCallback(
    async (body: { wear?: Wear; replan?: boolean }) => {
      if (!sessionId) return
      lastStart.current = body
      setNotice(null)
      if (body.replan) setBusy('replan')
      else {
        setBusy(body.wear ? 'wear' : null)
        setPhase('starting')
      }
      try {
        const p = await startLooks(sessionId, body)
        apply(p)
        setPhase('ready')
        setError(null)
      } catch (err) {
        const code = errorCode(err)
        if (code === 'person_required') setPhase('person')
        else if (body.replan) setNotice(code)
        else if (code === 'wear_required') setPhase('choose')
        else {
          setError(code)
          setPhase('error')
        }
      } finally {
        setBusy(null)
      }
    },
    [sessionId, apply],
  )

  // Initial load (and manual reload): GET, then start round 1 exactly once if needed.
  useEffect(() => {
    if (!sessionId) return
    const ctrl = new AbortController()
    getLooks(sessionId, ctrl.signal)
      .then((p) => {
        if (p.round === 0) {
          setPayload(p)
          if (p.wear === null) {
            setPhase('choose')
          } else if (startedFor.current !== sessionId) {
            startedFor.current = sessionId
            void start({})
          }
          return
        }
        apply(p)
        setPhase('ready')
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setError(errorCode(err))
        setPhase('error')
      })
    return () => ctrl.abort()
  }, [sessionId, nonce, start, apply])

  const active = !!payload && payload.round > 0 && (payload.rendering || hasOpenLayers(payload) || hasRunningEnhance(payload)) && !stalled

  // Poll while active; pause when the tab is hidden, resume immediately when it is shown.
  useEffect(() => {
    if (!sessionId || !active) return
    let gen = 0
    let timer: number | undefined
    let ctrl: AbortController | null = null
    const schedule = (g: number, ms: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void tick(g), ms)
    }
    const tick = async (g: number) => {
      if (g !== gen || document.hidden) return
      ctrl = new AbortController()
      try {
        const p = await getLooks(sessionId, ctrl.signal)
        if (g === gen) apply(p)
      } catch {
        /* transient network error: keep polling */
      }
      if (g === gen && !document.hidden) schedule(g, POLL_MS)
    }
    const onVisibility = () => {
      gen += 1
      window.clearTimeout(timer)
      ctrl?.abort()
      if (!document.hidden) void tick(gen)
    }
    schedule(gen, POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      gen += 1
      window.clearTimeout(timer)
      ctrl?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [sessionId, active, apply])

  const chooseWear = useCallback((wear: Wear) => void start({ wear }), [start])
  const replan = useCallback(() => void start({ replan: true }), [start])
  /** After the person is chosen: run the request that was waiting for it (first round or rebuild). */
  const resume = useCallback(() => void start(lastStart.current), [start])

  const retry = useCallback(
    async (lookId: string) => {
      if (!sessionId) return
      setNotice(null)
      setBusy(lookId)
      idleStreak.current = 0
      setStalled(false)
      try {
        apply(await retryLook(lookId))
      } catch (err) {
        if (errorCode(err) === 'nothing_to_retry') {
          try {
            apply(await getLooks(sessionId))
          } catch {
            /* ignore */
          }
        } else setNotice(errorCode(err))
      } finally {
        setBusy(null)
      }
    },
    [sessionId, apply],
  )

  /**
   * Applies one layer change (PATCH). The response marks the edited layer and every later one
   * "pending", which re-activates polling; the stall guard is reset so a stopped poll restarts.
   * Rejects with the server's error code (e.g. "look_busy", "edit_limit").
   */
  const edit = useCallback(
    async (lookId: string, layer: LayerName, body: LayerPatch) => {
      try {
        const p = await patchLayer(lookId, layer, body)
        idleStreak.current = 0
        setStalled(false)
        apply(p)
      } catch (err) {
        throw new Error(errorCode(err))
      }
    },
    [apply],
  )

  /** Starts (or, with `remove`, clears) a look's photo enhancement. Rejects with the error code. */
  const enhance = useCallback(
    async (lookId: string, remove = false) => {
      try {
        const p = await (remove ? clearLookEnhance(lookId) : enhanceLook(lookId))
        idleStreak.current = 0
        setStalled(false)
        apply(p)
      } catch (err) {
        throw new Error(errorCode(err))
      }
    },
    [apply],
  )

  const reload = useCallback(() => {
    startedFor.current = null
    setError(null)
    setPhase('loading')
    setNonce((n) => n + 1)
  }, [])

  return { payload, phase, error, notice, busy, events, active, finished, chooseWear, replan, resume, retry, edit, enhance, reload }
}
