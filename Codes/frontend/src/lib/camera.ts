/** Opening the live camera robustly across phones, tablets, desktops and in-app browsers. */

export type Facing = 'user' | 'environment'
export type CamError = 'unsupported' | 'insecure' | 'denied' | 'nocamera' | 'failed'

/** Not ready (no frames) this long after the stream arrived → show the error with alternatives. */
export const READY_TIMEOUT_MS = 6000
/** getUserMedia still pending this long (stuck webview, ignored prompt) → offer the alternatives. */
export const PERMISSION_TIMEOUT_MS = 20000

/** Tried in order: high resolution, then any camera facing the right way, then any camera at all. */
export function cameraConstraints(facing: Facing): MediaStreamConstraints[] {
  return [
    { video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false },
    { video: { facingMode: { ideal: facing } }, audio: false },
    { video: true, audio: false },
  ]
}

const errName = (err: unknown): string => (err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '')

/** Errors where a simpler constraint set may still work (Safari's OverconstrainedError is not a DOMException). */
function retryable(err: unknown): boolean {
  return ['OverconstrainedError', 'NotReadableError', 'TypeError', 'AbortError'].includes(errName(err)) || err instanceof TypeError
}

/** getUserMedia with fallbacks. Permission errors are not retried (the shopper said no). */
export async function openCamera(facing: Facing, gum: (c: MediaStreamConstraints) => Promise<MediaStream>): Promise<MediaStream> {
  let last: unknown
  for (const c of cameraConstraints(facing)) {
    try {
      return await gum(c)
    } catch (err) {
      last = err
      if (!retryable(err)) throw err
    }
  }
  throw last
}

export function cameraError(err: unknown): CamError {
  const name = errName(err)
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'nocamera'
  return 'failed'
}

/** Why the live camera can't even be tried here, or null when it can. */
export function cameraUnavailable(): CamError | null {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported'
  return null
}
