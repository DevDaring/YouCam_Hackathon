import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LocationPicker } from './LocationPicker'
import { GoldRule } from './Motifs'
import { buttonClass } from './ui'

interface Props {
  open: boolean
  onClose: () => void
}

/** Bottom sheet on phones, centred dialog on larger screens. Native <dialog> gives focus trap + Esc. */
export function LocationSheet({ open, onClose }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const introId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={introId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border border-line bg-bg p-0 text-text shadow-2xl sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-2xl font-semibold">
              {t('location.sheetTitle')}
            </h2>
            <GoldRule />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-heading hover:bg-surface"
            aria-label={t('common.close')}
          >
            <X aria-hidden="true" className="size-6" />
          </button>
        </div>
        <p id={introId} className="mb-5 mt-3 text-muted">
          {t('location.sheetIntro')}
        </p>
        {open ? <LocationPicker /> : null}
        <div className="mt-6 flex justify-end">
          <button type="button" className={`${buttonClass.primary} w-full sm:w-auto`} onClick={onClose}>
            {t('location.done')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
