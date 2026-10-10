import { Moon, Sun, SunMoon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applyTheme, getStoredTheme, nextTheme, type ThemePreference } from '../lib/theme'

const ICONS = { system: SunMoon, light: Sun, dark: Moon } as const

/** Cycles Auto → Light → Dark via the [data-theme] override. */
export function ThemeToggle() {
  const { t } = useTranslation()
  const [pref, setPref] = useState<ThemePreference>(getStoredTheme)
  const Icon = ICONS[pref]
  const mode = t(`footer.theme.${pref}`)

  useEffect(() => applyTheme(pref), [pref])

  return (
    <button
      type="button"
      onClick={() => setPref(nextTheme)}
      aria-label={t('footer.theme.label', { mode })}
      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-heading hover:bg-surface"
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>{mode}</span>
    </button>
  )
}
