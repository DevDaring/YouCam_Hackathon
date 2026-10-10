/** Shared class recipes so buttons and links look identical everywhere. */
const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-2 text-center text-base font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus'

export const buttonClass = {
  primary: `${base} bg-primary text-on-primary shadow-sm hover:bg-primary-hover`,
  secondary: `${base} border border-rule/70 bg-surface-raised text-heading hover:bg-surface`,
  ghost: `${base} px-4 text-heading underline-offset-4 hover:underline`,
} as const

export const cardClass = 'rounded-3xl border border-line bg-surface p-5 sm:p-6'

export const fieldClass =
  'block min-h-12 w-full rounded-2xl border border-line bg-surface-raised px-4 text-base text-text focus-visible:outline-3 focus-visible:outline-focus'

/** Selectable chip/card built on a visually-hidden native radio or checkbox. */
export const choiceClass =
  'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3 text-base text-text transition-colors hover:border-rule has-[input:checked]:border-primary has-[input:checked]:bg-accent-soft has-[input:checked]:text-on-accent has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus'
