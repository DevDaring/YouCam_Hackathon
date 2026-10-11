import { Camera, RefreshCw, Timer, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoKind } from '../../lib/api'
import { buttonClass } from '../ui'

type Facing = 'user' | 'environment'
type CamError = 'unsupported' | 'denied' | 'nocamera' | 'failed'
type Light = 'ok' | 'dark' | 'bright' | null
const TIMERS = [0, 3, 10] as const

interface Props {
  kind: PhotoKind
  /** id of the page's hidden file input, so "upload instead" is a real user gesture on that input */
  fileInputId: string
  onCapture: (photo: Blob) => void
  onClose: () => void
}

function cameraError(err: unknown): CamError {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'nocamera'
  return 'failed'
}

/** Full-screen camera with a framing guide, live light check, front/back switch and self-timer. */
export function CameraCapture({ kind, fileInputId, onCapture, onClose }: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const shutterRef = useRef<HTMLButtonElement>(null)
  const [facing, setFacing] = useState<Facing>(kind === 'face' ? 'user' : 'environment')
  const [error, setError] = useState<CamError | null>(null)
  const [ready, setReady] = useState(false)
  const [light, setLight] = useState<Light>(null)
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(kind === 'full' ? 3 : 0)
  const [countdown, setCountdown] = useState<number | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
  }, [])

  // Start / restart the stream when the facing mode changes.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError('unsupported')
      return
    }
    stop()
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          void v.play().catch(() => undefined)
        }
        setError(null)
      })
      .catch((err) => !cancelled && setError(cameraError(err)))
    return () => {
      cancelled = true
    }
  }, [facing, stop])

  useEffect(() => stop, [stop])

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
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <Camera aria-hidden="true" className="size-12 text-marigold-300" />
            <p role="alert" className="max-w-sm text-lg">
              {t(`camera.errors.${error}`)}
            </p>
            <label htmlFor={fileInputId} className={`${buttonClass.primary} cursor-pointer`} onClick={stop}>
              <Upload aria-hidden="true" className="size-5" />
              {t('photo.upload')}
            </label>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onLoadedData={() => setReady(true)}
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
            {!ready ? (
              <p className="absolute inset-0 flex items-center justify-center text-lg">{t('camera.starting')}</p>
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
