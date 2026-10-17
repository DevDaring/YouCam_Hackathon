import { AlertTriangle, ArrowRight, Camera, CheckCircle2, ImageUp, Loader2, RotateCcw, ScanFace, ShieldCheck, Sparkles, Undo2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GoldRule } from '../components/Motifs'
import { ProgressDots } from '../components/ProgressDots'
import { CameraCapture } from '../components/photo/CameraCapture'
import { buttonClass, cardClass } from '../components/ui'
import { enhancerName } from '../components/studio/lookUtils'
import { ApiError, enhancePhoto, getSession, restorePhoto, uploadPhoto, type PhotoInfo, type PhotoKind, type QualityCheck } from '../lib/api'
import { IMAGE_RETENTION_HOURS } from '../lib/config'
import { isInAppBrowser, isMobileDevice } from '../lib/device'
import { prepareUpload } from '../lib/image'

const KINDS: PhotoKind[] = ['full', 'face']
const ACCEPT = 'image/jpeg,image/png,image/webp'
/** The native camera input takes anything the phone's camera app produces (HEIC is converted in prepareUpload). */
const CAMERA_ACCEPT = 'image/*'

export default function Photo() {
  const { t } = useTranslation()
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const fileInputId = useId()
  const cameraInputId = useId()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  /** Phones/tablets: "Take my photo" opens the phone's own camera app (works in every browser and in-app webview). */
  const [mobile] = useState(isMobileDevice)
  const [inApp] = useState(() => isInAppBrowser())

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [stage, setStage] = useState<PhotoKind>('full')
  const [photos, setPhotos] = useState<Partial<Record<PhotoKind, PhotoInfo>>>({})
  const [cameraOpen, setCameraOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 'enhance' while sharpening (can take up to about a minute), 'restore' while putting the original back. */
  const [improving, setImproving] = useState<'enhance' | 'restore' | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    getSession(sessionId, ctrl.signal)
      .then((s) => {
        const map: Partial<Record<PhotoKind, PhotoInfo>> = {}
        s.photos.forEach((p) => (map[p.kind] = p))
        setPhotos(map)
        setLoading(false)
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setNotFound(err instanceof ApiError && err.status === 404)
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [sessionId])

  const send = useCallback(
    async (blob: Blob, source: 'camera' | 'upload') => {
      setCameraOpen(false)
      setUploading(true)
      setError(null)
      try {
        const prepared = await prepareUpload(blob)
        const info = await uploadPhoto(sessionId, stage, prepared, source)
        setPhotos((p) => ({ ...p, [stage]: info }))
      } catch (err) {
        const code = err instanceof ApiError ? err.detail : ''
        setError(['too_large', 'not_image', 'unsupported_format', 'too_small'].includes(code) ? t(`photo.errors.${code}`) : t('photo.errors.generic'))
      } finally {
        setUploading(false)
      }
    },
    [sessionId, stage, t],
  )

  const improve = async (mode: 'enhance' | 'restore') => {
    setImproving(mode)
    setError(null)
    try {
      const info = await (mode === 'enhance' ? enhancePhoto(sessionId, stage) : restorePhoto(sessionId, stage))
      setPhotos((p) => ({ ...p, [stage]: info }))
    } catch (err) {
      const code = err instanceof ApiError ? err.detail : ''
      setError(mode === 'enhance' && code.startsWith('enhance_failed') ? t('photo.enhance.failed') : t('photo.errors.generic'))
    } finally {
      setImproving(null)
    }
  }

  const onFile = (source: 'camera' | 'upload') => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow choosing the same file again
    setCameraOpen(false)
    if (file) void send(file, source)
  }

  /** Must stay synchronous inside the click handler: browsers only open the camera on a direct user gesture. */
  const openNativeCamera = () => cameraInputRef.current?.click()

  const next = () => {
    setError(null)
    if (stage === 'full') setStage('face')
    else navigate(`/studio/${sessionId}`)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12" aria-busy="true">
        <div className="mx-auto h-9 w-2/3 animate-pulse rounded-xl bg-line/60" />
        <div className="mt-8 h-96 animate-pulse rounded-3xl bg-line/40" />
      </div>
    )
  }
  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg">{t('photo.notFound')}</p>
        <Link to="/start" className={`${buttonClass.primary} mt-6`}>
          {t('photo.backToSetup')}
        </Link>
      </div>
    )
  }

  const current = photos[stage]
  const checks = current?.quality?.checks ?? []
  const hardFail = current?.quality ? !current.quality.ok : false
  /** Soft or dark photo: suggest enhancing prominently. */
  const soft = checks.some((c) => (c.key === 'sharp' || c.key === 'light') && c.status !== 'pass')
  const by = enhancerName(current?.enhanced_by)

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t(`photo.title.${stage}`)}</h1>
        <GoldRule />
        <p className="mt-4 text-muted">{t(`photo.intro.${stage}`)}</p>
      </div>
      <div className="mt-6">
        <ProgressDots total={KINDS.length} current={KINDS.indexOf(stage)} label={t('photo.progress', { current: KINDS.indexOf(stage) + 1, total: KINDS.length })} />
      </div>

      <input id={fileInputId} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={onFile('upload')} data-testid="photo-upload-input" />
      {mobile ? (
        <input
          key={stage}
          ref={cameraInputRef}
          id={cameraInputId}
          type="file"
          accept={CAMERA_ACCEPT}
          capture={stage === 'face' ? 'user' : 'environment'}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile('camera')}
          data-testid="photo-camera-input"
        />
      ) : null}

      <section className={`${cardClass} mt-6 space-y-5`} aria-live="polite" aria-busy={uploading || !!improving}>
        {uploading || improving ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 aria-hidden="true" className="size-10 animate-spin text-heading" />
            <p className="font-semibold text-heading">{improving === 'enhance' ? t('photo.enhance.running') : t('photo.checking')}</p>
            {improving === 'enhance' ? <p className="max-w-xs text-sm text-muted">{t('photo.enhance.runningNote')}</p> : null}
          </div>
        ) : current ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
              <img src={current.url} alt={t(`photo.previewAlt.${stage}`)} className="mx-auto max-h-[60vh] w-auto object-contain" />
            </div>
            <QualityChips checks={checks} kind={stage} />
            {current.enhanced ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface-raised px-4 py-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
                  {t('photo.enhance.done')}
                  {by ? <span className="font-normal text-muted">{t('photo.enhance.by', { who: by })}</span> : null}
                </p>
                <button type="button" onClick={() => void improve('restore')} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-heading underline underline-offset-4">
                  <Undo2 aria-hidden="true" className="size-4" />
                  {t('photo.enhance.restore')}
                </button>
              </div>
            ) : soft ? (
              <div className="space-y-3 rounded-2xl border border-rule/60 bg-accent-soft/40 p-4">
                <p className="flex items-start gap-2 text-sm font-medium text-text">
                  <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-heading" />
                  {t('photo.enhance.suggest')}
                </p>
                <button type="button" onClick={() => void improve('enhance')} className={`${buttonClass.primary} w-full`}>
                  <Sparkles aria-hidden="true" className="size-5" />
                  {t('photo.enhance.button')}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <button type="button" onClick={() => void improve('enhance')} className={`${buttonClass.secondary} w-full`}>
                  <Sparkles aria-hidden="true" className="size-5" />
                  {t('photo.enhance.button')}
                </button>
                <p className="text-center text-xs text-muted">{t('photo.enhance.hint')}</p>
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <button type="button" onClick={next} className={`${buttonClass.primary} flex-1`}>
                {hardFail ? t('photo.continueAnyway') : t('photo.usePhoto')}
                <ArrowRight aria-hidden="true" className="size-5" />
              </button>
              <button type="button" onClick={() => setPhotos((p) => ({ ...p, [stage]: undefined }))} className={`${buttonClass.secondary} flex-1`}>
                <RotateCcw aria-hidden="true" className="size-5" />
                {t('photo.retake')}
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="space-y-2 text-sm">
              {Object.values(t(`photo.tips.${stage}`, { returnObjects: true }) as Record<string, string>).map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {tip}
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={mobile ? openNativeCamera : () => setCameraOpen(true)} className={`${buttonClass.primary} w-full`}>
                <Camera aria-hidden="true" className="size-5" />
                {t('photo.take')}
              </button>
              <label htmlFor={fileInputId} className={`${buttonClass.secondary} w-full cursor-pointer`}>
                <ImageUp aria-hidden="true" className="size-5" />
                {t('photo.upload')}
              </label>
            </div>
            {mobile ? (
              <div className="space-y-1 text-center">
                <button type="button" onClick={() => setCameraOpen(true)} className={`${buttonClass.ghost} w-full text-sm`}>
                  <ScanFace aria-hidden="true" className="size-5" />
                  {t('photo.liveCamera')}
                </button>
                {inApp ? <p className="text-xs text-muted">{t('camera.inApp')}</p> : null}
              </div>
            ) : null}
            {stage === 'face' ? (
              <button type="button" onClick={next} className={`${buttonClass.ghost} w-full`}>
                {t('photo.skipFace')}
              </button>
            ) : null}
          </>
        )}
        {error ? (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </section>

      <p className="mt-5 flex items-start justify-center gap-2 text-center text-sm text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
        {t('photo.privacy', { hours: IMAGE_RETENTION_HOURS })}
      </p>

      <div className="mt-6 flex justify-center">
        {stage === 'face' ? (
          <button type="button" onClick={() => setStage('full')} className={buttonClass.ghost}>
            {t('setup.back')}
          </button>
        ) : (
          <Link to="/start" className={buttonClass.ghost}>
            {t('photo.backToSetup')}
          </Link>
        )}
      </div>

      {cameraOpen ? (
        <CameraCapture
          kind={stage}
          fileInputId={fileInputId}
          nativeCameraInputId={mobile ? cameraInputId : undefined}
          onCapture={(b) => void send(b, 'camera')} onClose={() => setCameraOpen(false)} />
      ) : null}
    </div>
  )
}

function QualityChips({ checks, kind }: { checks: QualityCheck[]; kind: PhotoKind }) {
  const { t } = useTranslation()
  if (!checks.length) return null
  return (
    <ul className="space-y-2" aria-label={t('photo.qualityTitle')}>
      {checks.map((c) => {
        const Icon = c.status === 'pass' ? CheckCircle2 : c.status === 'warn' ? AlertTriangle : XCircle
        const tone = c.status === 'pass' ? 'text-success' : c.status === 'warn' ? 'text-warning' : 'text-danger'
        const msgKey = c.key === 'face_size' ? `photo.checks.face_size_${kind}.${c.status}` : `photo.checks.${c.key}.${c.status}`
        return (
          <li key={c.key} className="flex items-start gap-2 text-sm">
            <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tone}`} />
            <span>{t(msgKey)}</span>
          </li>
        )
      })}
    </ul>
  )
}
