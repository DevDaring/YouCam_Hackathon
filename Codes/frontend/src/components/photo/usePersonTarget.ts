import { useCallback, useRef, useState } from 'react'
import { choosePerson, type PhotoInfo } from '../../lib/api'

/**
 * Saves who gets dressed in a group photo. Optimistic: the tapped face is selected at once and
 * put back if the server says no. Only the latest tap's answer counts (fast taps or arrow keys).
 * Resolves true once the server has stored the choice.
 */
export function usePersonTarget(sessionId: string, full: PhotoInfo | undefined, setFull: (p: PhotoInfo) => void) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)
  /** Last state the server confirmed, so a failed tap goes back to it (not to another pending tap). */
  const confirmed = useRef<PhotoInfo | undefined>(undefined)

  const choose = useCallback(
    async (index: number): Promise<boolean> => {
      if (!full) return false
      const id = ++seq.current
      if (!saving) confirmed.current = full
      setFailed(false)
      setSaving(true)
      setFull({ ...full, target: index, target_source: 'user' })
      try {
        const info = await choosePerson(sessionId, index)
        if (id === seq.current) {
          confirmed.current = info
          setFull(info)
        }
        return id === seq.current
      } catch {
        if (id === seq.current && confirmed.current) {
          setFull(confirmed.current)
          setFailed(true)
        }
        return false
      } finally {
        if (id === seq.current) setSaving(false)
      }
    },
    [sessionId, full, saving, setFull],
  )

  return { choose, saving, failed }
}
