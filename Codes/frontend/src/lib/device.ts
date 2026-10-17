/**
 * Device sniffing used to pick the most reliable way to take a photo and to share.
 * Kept tiny and side-effect free so it is easy to mock in tests.
 */

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i
/** Facebook, Messenger, Instagram, LINE, X/Twitter, WhatsApp, Snapchat, Telegram and Android WebViews. */
const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|\bLine\/|Twitter|WhatsApp|wv\)|Snapchat|Telegram/i

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
}

/** Phones and tablets: touch-first pointer or a mobile user agent (incl. iPadOS posing as a Mac). */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true
  } catch {
    /* very old browsers */
  }
  if (MOBILE_UA.test(ua())) return true
  return typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

/** In-app browsers (WhatsApp, Instagram, Facebook, Telegram …) where the live camera is often blocked. */
export function isInAppBrowser(userAgent: string = ua()): boolean {
  return IN_APP_UA.test(userAgent)
}
