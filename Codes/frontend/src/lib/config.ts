/** Public, non-secret product constants. The frontend never holds secrets. */
export const IMAGE_RETENTION_HOURS = Number(import.meta.env.VITE_IMAGE_RETENTION_HOURS ?? 72) || 72 // must match backend IMAGE_RETENTION_HOURS
