import type { EventDraft } from '../../lib/draft'

export interface StepProps {
  draft: EventDraft
  update: (patch: Partial<EventDraft>) => void
  /** id of the step heading, used to label the fieldset */
  labelledBy: string
}
