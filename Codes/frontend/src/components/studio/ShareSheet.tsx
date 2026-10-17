import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  Aperture,
  AtSign,
  Briefcase,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Lock,
  Mail,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Pin,
  RefreshCw,
  Send,
  Share2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, shareLook, type Look, type ShareInfo } from '../../lib/api'
import { isMobileDevice } from '../../lib/device'
import { absoluteUrl, copyText, downloadUrl, shareLinks, type PlatformKey } from '../../lib/share'
import { GoldRule } from '../Motifs'
import { buttonClass } from '../ui'
import { lookName } from './lookUtils'

interface Props {
  look: Look
  num: (n: number) => string
  /** Translated event name, for the default share text. */
  eventName: string
  /** BCP-47 tag for the privacy-note date, e.g. "en-IN". */
  dateLocale: string
  /** Session deletion time, used when the API doesn't send `expires_at`. */
  deleteAfter: string | null
  onClose: () => void
}

/** Proper nouns: shown as plain text with neutral icons (no third-party logos or brand colours). */
const PLATFORM: Record<PlatformKey, { name?: string; icon: LucideIcon }> = {
  whatsapp: { name: 'WhatsApp', icon: MessageCircle },
  facebook: { name: 'Facebook', icon: Users },
  x: { name: 'X', icon: AtSign },
  telegram: { name: 'Telegram', icon: Send },
  pinterest: { name: 'Pinterest', icon: Pin },
  linkedin: { name: 'LinkedIn', icon: Briefcase },
  reddit: { name: 'Reddit', icon: MessagesSquare },
  email: { icon: Mail },
  sms: { icon: MessageSquareText },
}
/** Apps without a web share URL: native file share on phones, otherwise download + instructions. */
const GALLERY_APPS = [
  { key: 'instagram', name: 'Instagram', icon: ImageIcon },
  { key: 'snapchat', name: 'Snapchat', icon: Aperture },
] as const

const COPIED_MS = 2500
const isAbort = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError'

const tile =
  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface-raised px-2 py-2 text-center text-sm font-semibold text-heading transition-colors hover:border-rule hover:bg-surface focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * Bottom sheet (phones) / centred dialog (larger screens) to share one look. On open it asks the
 * server for the public link (POST /share, idempotent) and prefetches the JPEG so the native share
 * sheet can send the picture itself while the tap still counts as a user gesture.
 */
export function ShareSheet({ look, num, eventName, dateLocale, deleteAfter, onClose }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const native = useRef(false)
  const titleId = useId()
  const linkId = useId()
  const reduce = useReducedMotion() ?? false
  const name = lookName(t, look.slot)
  const [mobile] = useState(isMobileDevice)
  const [canNativeShare] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')

  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [error, setError] = useState<'nothing' | 'generic' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') {
      native.current = true
      if (!dialog.open) dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
  }, [])

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  // Create (or fetch the existing) share link, then prefetch the picture for file sharing.
  useEffect(() => {
    let cancelled = false
    setError(null)
    setInfo(null)
    setFile(null)
    shareLook(look.id)
      .then(async (s) => {
        if (cancelled) return
        setInfo(s)
        try {
          const res = await fetch(s.image_url, { credentials: 'same-origin' })
          if (!res.ok) return
          const blob = await res.blob()
          // Web Share only accepts image files with an image MIME type; the endpoint serves JPEG.
          const type = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
          if (!cancelled) setFile(new File([blob], 'dearyou-look.jpg', { type }))
        } catch {
          /* link sharing still works without the file */
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError && err.detail === 'nothing_to_share' ? 'nothing' : 'generic')
      })
    return () => {
      cancelled = true
    }
  }, [look.id, attempt])

  const close = () => {
    const dialog = ref.current
    if (native.current && dialog?.open) dialog.close() // fires "close" → onClose
    else onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape' && !native.current) {
      e.preventDefault()
      onClose()
    }
  }

  const title = `${t('studio.lookNumber', { n: num(look.slot) })} · ${name}`
  const text = info?.text?.trim() || t('studio.share.defaultText', { lookName: name, event: eventName })
  const when = info?.expires_at ?? deleteAfter
  let date: string | null = null
  if (when) {
    try {
      date = new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium' }).format(new Date(when))
    } catch {
      date = null
    }
  }
  const filename = `dearyou-look-${look.slot}.jpg`
  const canShareFile = useCallback(() => {
    try {
      return !!file && !!navigator.canShare?.({ files: [file] })
    } catch {
      return false
    }
  }, [file])

  const shareNative = async () => {
    if (!info) return
    setNotice(null)
    try {
      if (canShareFile()) await navigator.share({ files: [file!], title, text, url: info.url })
      else await navigator.share({ title, text, url: info.url })
    } catch (err) {
      if (!isAbort(err)) setNotice(t('studio.share.errors.native'))
    }
  }

  const shareToGallery = async (app: string) => {
    if (!info) return
    setNotice(null)
    if (mobile && canNativeShare && canShareFile()) {
      try {
        await navigator.share({ files: [file!], title, text })
        return
      } catch (err) {
        if (isAbort(err)) return
        /* fall back to saving the picture */
      }
    }
    downloadUrl(info.image_url, filename)
    setNotice(t('studio.share.saved', { app }))
  }

  const copy = async () => {
    if (!info) return
    const ok = await copyText(info.url)
    window.clearTimeout(copiedTimer.current)
    if (ok) {
      setCopied(true)
      setNotice(null)
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
    } else {
      setNotice(t('studio.share.errors.copy'))
    }
  }

  const links = info ? shareLinks({ url: info.url, text, title, imageUrl: absoluteUrl(info.image_url, info.url) }, mobile) : []

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-bg p-0 text-text shadow-2xl sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[92dvh] sm:max-w-xl sm:rounded-3xl"
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6 sm:pt-6"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-2xl font-semibold">
              {t('studio.share.title', { name })}
            </h2>
            <GoldRule />
          </div>
          <button
            type="button"
            data-autofocus
            onClick={close}
            className="-mr-2 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-heading hover:bg-surface"
            aria-label={t('common.close')}
          >
            <X aria-hidden="true" className="size-6" />
          </button>
        </div>

        {error ? (
          <div role="alert" className="mt-4 flex flex-col items-start gap-3 rounded-2xl bg-danger/10 p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-danger">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t(`studio.share.errors.${error}`)}
            </p>
            {error === 'generic' ? (
              <button type="button" className={buttonClass.secondary} onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw aria-hidden="true" className="size-5" />
                {t('common.retry')}
              </button>
            ) : null}
          </div>
        ) : !info ? (
          <div aria-busy="true" className="mt-4 space-y-3">
            <p className="text-sm text-muted">{t('studio.share.preparing')}</p>
            <div className="flex gap-3">
              <div className="aspect-[3/4] w-24 animate-pulse rounded-2xl bg-line/40" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-2/3 animate-pulse rounded-lg bg-line/40" />
                <div className="h-4 w-full animate-pulse rounded-lg bg-line/30" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-line/30" />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="flex items-start gap-3">
              <img
                src={info.image_url}
                alt={t('studio.share.imageAlt', { name })}
                className="aspect-[3/4] w-24 shrink-0 rounded-2xl border border-line bg-surface-raised object-cover object-top sm:w-28"
              />
              <div className="min-w-0">
                <p className="font-semibold text-heading">{title}</p>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </div>

            {canNativeShare ? (
              <div className="space-y-1">
                <button type="button" onClick={() => void shareNative()} className={`${buttonClass.primary} w-full`}>
                  <Share2 aria-hidden="true" className="size-5" />
                  {t('studio.share.native')}
                </button>
                {mobile ? <p className="text-center text-xs text-muted">{t('studio.share.nativeHint')}</p> : null}
              </div>
            ) : null}

            <section aria-labelledby={`${titleId}-to`}>
              <h3 id={`${titleId}-to`} className="mb-2 text-base font-semibold">
                {t('studio.share.platforms')}
              </h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {links.map((l) => {
                  const p = PLATFORM[l.key]
                  const Icon = p.icon
                  return (
                    <li key={l.key}>
                      <a
                        href={l.href}
                        className={tile}
                        data-platform={l.key}
                        {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        <Icon aria-hidden="true" className="size-5" />
                        <span className="leading-tight">{p.name ?? t(`studio.share.${l.key}`)}</span>
                        {l.external ? <span className="sr-only"> {t('studio.share.newTab')}</span> : null}
                      </a>
                    </li>
                  )
                })}
                {GALLERY_APPS.map((app) => (
                  <li key={app.key}>
                    <button type="button" className={`${tile} w-full`} data-platform={app.key} onClick={() => void shareToGallery(app.name)}>
                      <app.icon aria-hidden="true" className="size-5" />
                      <span className="leading-tight">{app.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <p role="status" aria-live="polite" className={notice ? 'rounded-2xl bg-accent-soft/60 px-4 py-3 text-sm font-medium text-text' : 'sr-only'}>
              {notice}
            </p>

            <div className="space-y-2">
              <label htmlFor={linkId} className="text-sm font-semibold text-heading">
                {t('studio.share.linkLabel')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={linkId}
                  readOnly
                  value={info.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="block min-h-12 w-full min-w-0 rounded-2xl border border-line bg-surface-raised px-4 text-sm text-text"
                />
                <button type="button" onClick={() => void copy()} className={`${buttonClass.secondary} shrink-0`}>
                  {copied ? <Check aria-hidden="true" className="size-5 text-success" /> : <Copy aria-hidden="true" className="size-5" />}
                  {copied ? t('studio.share.copied') : t('studio.share.copy')}
                </button>
              </div>
            </div>

            <a href={info.image_url} download={filename} className={`${buttonClass.secondary} w-full`}>
              <Download aria-hidden="true" className="size-5" />
              {t('studio.share.download')}
            </a>

            <p className="flex items-start gap-2 text-xs text-muted">
              <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {date ? t('studio.share.privacy', { date }) : t('studio.share.privacyNoDate')}
            </p>
          </div>
        )}
      </motion.div>
    </dialog>
  )
}
