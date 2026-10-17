/** Share-link builders. Plain URLs only: no third-party SDKs, scripts or logos. */

export type PlatformKey = 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'pinterest' | 'linkedin' | 'reddit' | 'email' | 'sms'

export interface ShareLink {
  key: PlatformKey
  href: string
  /** Web links open in a new tab; mailto:/sms: hand off to an app. */
  external: boolean
}

export interface ShareTarget {
  url: string
  text: string
  title: string
  /** Absolute URL of the look image (Pinterest needs it). */
  imageUrl: string
}

const enc = encodeURIComponent

/** Links in display order; SMS only on phones. */
export function shareLinks({ url, text, title, imageUrl }: ShareTarget, mobile: boolean): ShareLink[] {
  const textUrl = enc(`${text} ${url}`)
  const links: ShareLink[] = [
    { key: 'whatsapp', href: `https://wa.me/?text=${textUrl}`, external: true },
    { key: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, external: true },
    { key: 'x', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, external: true },
    { key: 'telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`, external: true },
    { key: 'pinterest', href: `https://pinterest.com/pin/create/button/?url=${enc(url)}&media=${enc(imageUrl)}&description=${enc(text)}`, external: true },
    { key: 'linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, external: true },
    { key: 'reddit', href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`, external: true },
    { key: 'email', href: `mailto:?subject=${enc(title)}&body=${textUrl}`, external: false },
  ]
  if (mobile) links.push({ key: 'sms', href: `sms:?&body=${textUrl}`, external: false })
  return links
}

/** Resolves the API's image path against the public share page, so external sites can fetch it. */
export function absoluteUrl(path: string, base: string): string {
  try {
    return new URL(path, base).href
  } catch {
    return path
  }
}

/** Clipboard API with a textarea + execCommand fallback (older Android webviews, http pages). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand?.('copy') ?? false
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/** Saves a URL as a file via a temporary <a download> (same-origin, so the filename is honoured). */
export function downloadUrl(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
