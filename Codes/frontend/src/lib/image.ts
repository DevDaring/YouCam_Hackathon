/**
 * Shrink large photos in the browser before upload (phones produce 4–12 MB files).
 * Re-encoding also drops EXIF/GPS on the device; the server strips it again regardless.
 */
const MAX_SIDE = 2048
const SHRINK_ABOVE_BYTES = 2.5 * 1024 * 1024
/** Formats the server accepts as-is; anything else a phone camera hands us (e.g. HEIC) is re-encoded to JPEG. */
const SERVER_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function prepareUpload(blob: Blob): Promise<Blob> {
  const convert = !!blob.type && !SERVER_TYPES.includes(blob.type)
  if ((!convert && blob.size <= SHRINK_ABOVE_BYTES) || typeof createImageBitmap !== 'function') return blob
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
    return out && (convert || out.size < blob.size) ? out : blob
  } catch {
    return blob // the server validates and resizes anyway
  }
}
