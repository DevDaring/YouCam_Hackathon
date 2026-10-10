import { Crown, Sparkles, UserRound, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ROLES, type Role } from '../../lib/draft'
import { choiceClass } from '../ui'
import type { StepProps } from './types'

const ICONS: Record<Role, typeof Crown> = {
  bride: Crown,
  groom: Sparkles,
  family: UsersRound,
  guest: UserRound,
}

export function RoleStep({ draft, update, labelledBy }: StepProps) {
  const { t } = useTranslation()
  return (
    <fieldset aria-labelledby={labelledBy} className="grid gap-3 sm:grid-cols-2">
      {ROLES.map((role) => {
        const Icon = ICONS[role]
        return (
          <label key={role} className={choiceClass}>
            <input
              type="radio"
              name="role"
              value={role}
              checked={draft.role === role}
              onChange={() => update({ role })}
              className="sr-only"
            />
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-rule text-heading">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">{t(`setup.roles.${role}`)}</span>
              <span className="text-sm opacity-85">{t(`setup.roleHints.${role}`)}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
