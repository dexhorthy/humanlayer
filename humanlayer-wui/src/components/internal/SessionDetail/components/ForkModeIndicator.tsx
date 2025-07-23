import { ConversationEvent } from '@/lib/daemon/types'

interface ForkModeIndicatorProps {
  previewEventIndex: number | null
  events: ConversationEvent[]
}

export function ForkModeIndicator({ previewEventIndex, events }: ForkModeIndicatorProps) {
  if (previewEventIndex === null) return null

  const turnNumber = events
    .slice(0, previewEventIndex)
    .filter(e => e.event_type === 'message' && e.role === 'user').length

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 mb-4 text-sm">
      <span className="text-amber-600 dark:text-amber-400">
        Fork mode: Forking from turn {turnNumber}
      </span>
    </div>
  )
}
