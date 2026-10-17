import { Camera, ImageUp, RefreshCw, RotateCcw, Smartphone, Timer, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoKind } from '../../lib/api'
import { cameraError, cameraUnavailable, openCamera, PERMISSION_TIMEOUT_MS, READY_TIMEOUT_MS, type CamError, type Facing } from '../../lib/camera'
import { isInAppBrowser } from '../../lib/device'
import { buttonClass } from '../ui'

type Light = 'ok' | 'dark' | 'bright' | null
const TIMERS = [0, 3, 10] as const

interface Props {
  kind: PhotoKind
  /** id of the page's hidden file input, so "upload instead" is a real user gesture on that input */
  fileInputId: string
  /** id of the page's hidden native-camera input (phones only), offered when the live camera fails */
  nativeCameraInputId?: string
  onCapture: (photo: Blob) => void
  onClose: () => void
}

/** iOS Safari only plays a camera stream inline when these are set before srcObject. */
function prepareVideo(v: HTMLVideoElement) {
  v.muted = true
  v.playsInline = true
  v.autoplay = true
  v.setAttribute('muted', '')
  v.setAttribute('playsinline', '')
  v.setAttribute('webkit-playsinline', '')
}

/** Full-screen camera with a framing guide, live light check, front/back switch and self-timer. */
export function CameraCapture({ kind, fileInputId, nativeCameraInputId, onCapture, onClose }: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const shutterRef = useRef<HTMLButtonElement>(null)
  /** Bumped whenever a start attempt is abandoned, so a late getUserMedia result is discarded. */
  const genRef = useRef(0)
  const [facing, setFacing] = useState<Facing>(kind === 'face' ? 'user' : 'environment')
  const [error, setError] = useState<CamError | null>(null)
  /** Bumped by "Try again" to restart the stream. */
  const [attempt, setAttempt] = useState(0)
  /** The stream arrived and is attached to the video (frames may not be flowing yet). */
  const [live, setLive] = useState(false)
  const [ready, setReady] = useState(false)
  /** play() was refused (autoplay policy / low-power mode): one tap starts it. */
  const [needsTap, setNeedsTap] = useState(false)
  const [light, setLight] = useState<Light>(null)
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(kind === 'full' ? 3 : 0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const inApp = isInAppBrowser()

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
  }, [])

  const fail = useCallback(
    (e: CamError) => {
      genRef.current += 1
      stop()
      setLive(false)
      setReady(false)
      setCountdown(null)
      setError(e)
    },
    [stop],
  )

  const markReady = useCallback(() => setReady(true), [])

  const play = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    try {
      const p = v.play() as Promise<void> | undefined
      p?.then(
        () => setNeedsTap(false),
        (err: unknown) => {
          // AbortError: a newer srcObject/load interrupted this play() — harmless.
          if ((err as { name?: string })?.name !== 'AbortError') setNeedsTap(true)
        },
      )
    } catch {
      setNeedsTap(true)
    }
  }, [])

  // Start / restart the stream when the facing mode changes or the shopper taps "Try again".
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setLive(false)
    setNeedsTap(false)
    const why = cameraUnavailable()
    if (why) {
      setError(why)
      return
    }
    stop()
    const gen = ++genRef.current
    const stale = () => cancelled || gen !== genRef.current
    openCamera(facing, (c) => navigator.mediaDevices.getUserMedia(c))
      .then((stream) => {
        if (stale()) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream
        // Another app grabbing the camera (or the OS revoking it) ends the track.
        stream.getVideoTracks().forEach((tr) => tr.addEventListener?.('ended', () => !stale() && streamRef.current === stream && fail('failed')))
        const v = videoRef.current
        if (v) {
          prepareVideo(v)
          v.srcObject = stream
          play()
        }
        setError(null)
        setLive(true)
      })
      .catch((err) => !stale() && setError(cameraError(err)))
    return () => {
      cancelled = true
    }
  }, [facing, attempt, stop, play, fail])

  useEffect(() => stop, [stop])

  // Watchdog: a stream that never produces frames (or a prompt that never resolves) must not
  // leave the shopper staring at "Starting camera…" — show the alternatives instead.
  useEffect(() => {
    if (ready || error) return
    const id = window.setTimeout(() => fail('failed'), live ? READY_TIMEOUT_MS : PERMISSION_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [ready, error, live, fail, facing, attempt])

  // Live light check on a tiny downscaled frame (cheap: 24×24 px twice a second).
  useEffect(() => {
    if (!ready) return
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 24
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const id = window.setInterval(() => {
      const v = videoRef.current
      if (!ctx || !v || v.readyState < 2) return
      ctx.drawImage(v, 0, 0, 24, 24)
      const px = ctx.getImageData(0, 0, 24, 24).data
      let sum = 0
      for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
      const mean = sum / (px.length / 4)
      setLight(mean < 60 ? 'dark' : mean > 215 ? 'bright' : 'ok')
    }, 500)
    return () => window.clearInterval(id)
  }, [ready])

  // Escape closes; focus the shutter once the camera is live.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    if (ready) shutterRef.current?.focus()
  }, [ready])

  const capture = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')?.drawImage(v, 0, 0) // saved un-mirrored (true orientation)
    canvas.toBlob((blob) => {
      if (blob) {
        stop()
        onCapture(blob)
      }
    }, 'image/jpeg', 0.92)
  }, [onCapture, stop])

  // Self-timer countdown.
  useEffect(() => {
    if (countdown == null) return
    if (countdown === 0) {
      setCountdown(null)
      capture()
      return
    }
    const id = window.setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [countdown, capture])

  const shoot = () => (timer ? setCountdown(timer) : capture())
  const mirrored = facing === 'user'

  return (
    <div role="dialog" aria-modal="true" aria-label={t(`camera.title.${kind}`)} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="inline-flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
        <p className="truncate text-sm font-semibold">{t(`camera.title.${kind}`)}</p>
        <span className="size-12" aria-hidden="true" />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-4 text-center">
            <Camera aria-hidden="true" className="size-12 shrink-0 text-marigold-300" />
            <p role="alert" className="max-w-sm text-lg">
              {t(`camera.errors.${error}`)}
            </p>
            <p className="max-w-sm text-sm text-white/80">{t(nativeCameraInputId ? 'camera.alternatives.phone' : 'camera.alternatives.upload')}</p>
            {inApp ? <p className="max-w-sm rounded-2xl bg-white/10 px-4 py-2 text-sm">{t('camera.inApp')}</p> : null}
            <div className="flex w-full max-w-xs flex-col gap-3">
              {nativeCameraInputId ? (
                <label htmlFor={nativeCameraInputId} className={`${buttonClass.primary} w-full cursor-pointer`} onClick={stop}>
                  <Smartphone aria-hidden="true" className="size-5" />
                  {t('camera.phoneCamera')}
                </label>
              ) : null}
              <label
                htmlFor={fileInputId}
                className={`${nativeCameraInputId ? 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-2 text-base font-semibold hover:bg-white/20' : buttonClass.primary} w-full cursor-pointer`}
                onClick={stop}
              >
                <ImageUp aria-hidden="true" className="size-5" />
                {t('photo.upload')}
              </label>
              {error !== 'unsupported' && error !== 'insecure' ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setAttempt((n) => n + 1)
                  }}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-base font-semibold underline-offset-4 hover:underline"
                >
                  <RotateCcw aria-hidden="true" className="size-5" />
                  {t('common.retry')}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onLoadedMetadata={markReady}
              onLoadedData={markReady}
              onPlaying={() => {
                setNeedsTap(false)
                markReady()
              }}
              className={`size-full object-contain ${mirrored ? '-scale-x-100' : ''}`}
            />
            <FramingGuide kind={kind} />
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              {light ? (
                <span
                  aria-live="polite"
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${light === 'ok' ? 'bg-leaf-600' : 'bg-amber-600'}`}
                >
                  {t(`camera.light.${light}`)}
                </span>
              ) : null}
            </div>
            {countdown != null ? (
              <div aria-live="assertive" className="absolute inset-0 flex items-center justify-center bg-black/30 font-display text-8xl font-bold">
                {countdown}
              </div>
            ) : null}
            {needsTap ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <button type="button" onClick={play} className={buttonClass.primary}>
                  <Camera aria-hidden="true" className="size-5" />
                  {t('camera.tapToStart')}
                </button>
              </div>
            ) : !ready ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-lg">{t('camera.starting')}</p>
                {inApp ? <p className="max-w-sm text-sm text-white/80">{t('camera.inApp')}</p> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {!error ? (
        <div className="flex items-center justify-around gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => setTimer((x) => TIMERS[(TIMERS.indexOf(x) + 1) % TIMERS.length])}
            aria-label={t('camera.timer', { seconds: timer })}
            className="inline-flex min-h-12 min-w-16 items-center justify-center gap-1 rounded-full bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"
          >
            <Timer aria-hidden="true" className="size-5" />
            {timer ? `${timer}s` : t('camera.timerOff')}
          </button>
          <button
            ref={shutterRef}
            type="button"
            onClick={shoot}
            disabled={!ready || countdown != null}
            aria-label={t('camera.shutter')}
            className="size-20 rounded-full border-4 border-white bg-white/25 ring-4 ring-marigold-500/60 transition hover:bg-white/40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            aria-label={t('camera.flip')}
            className="inline-flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <RefreshCw aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : null}
      <p className="px-4 pb-3 text-center text-sm text-white/80">{t(`camera.hint.${kind}`)}</p>
    </div>
  )
}

function FramingGuide({ kind }: { kind: PhotoKind }) {
  return (
    <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
      {kind === 'face' ? (
        <ellipse cx="150" cy="185" rx="92" ry="122" fill="none" stroke="#F8CF86" strokeWidth="2.5" strokeDasharray="8 6" />
      ) : (
        <path
          d="M150 40 a26 30 0 1 1 -0.1 0 Z M110 105 C 95 112 88 130 86 160 L 78 250 M190 105 C 205 112 212 130 214 160 L 222 250 M118 108 C 112 170 112 240 116 300 L 120 372 M182 108 C 188 170 188 240 184 300 L 180 372"
          fill="none"
          stroke="#F8CF86"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="8 6"
        />
      )}
    </svg>
  )
}
