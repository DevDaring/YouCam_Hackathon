import type { ReactNode } from 'react'
import { GoldRule } from './Motifs'

interface Props {
  id: string
  title: ReactNode
  intro?: ReactNode
  align?: 'left' | 'center'
}

export function SectionHeading({ id, title, intro, align = 'center' }: Props) {
  const centered = align === 'center'
  return (
    <div className={centered ? 'flex flex-col items-center text-center' : 'flex flex-col items-start'}>
      <h2 id={id} className="text-2xl font-semibold sm:text-3xl">
        {title}
      </h2>
      <GoldRule />
      {intro ? <p className="mt-4 max-w-prose text-muted">{intro}</p> : null}
    </div>
  )
}
