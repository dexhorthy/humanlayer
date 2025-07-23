import React, { useState } from 'react'
import { Archive, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { SessionInfo } from '@/lib/daemon/types'
import { daemonClient } from '@/lib/daemon/client'
import { useStore } from '@/stores/appStore'
import { getStatusTextClass } from '@/utils/component-utils'
import { truncate } from '@/utils/formatting'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ForkViewModal } from './ForkViewModal'
import { ConversationEvent } from '@/lib/daemon/types'

interface SessionHeaderProps {
  session: SessionInfo
  events: ConversationEvent[]
  previewEventIndex: number | null
  onForkSelect: (eventIndex: number | null) => void
  forkViewOpen: boolean
  setForkViewOpen: (open: boolean) => void
  isCompactView?: boolean
}

export function SessionHeader({
  session,
  events,
  previewEventIndex,
  onForkSelect,
  forkViewOpen,
  setForkViewOpen,
  isCompactView = false,
}: SessionHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editValue, setEditValue] = useState('')

  const startEditTitle = () => {
    setIsEditingTitle(true)
    setEditValue(session.title || session.summary || '')
  }

  const saveEditTitle = async () => {
    try {
      await daemonClient.updateSessionTitle(session.id, editValue)
      useStore.getState().updateSession(session.id, { title: editValue })
      setIsEditingTitle(false)
      setEditValue('')
    } catch (error) {
      toast.error('Failed to update session title', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const cancelEditTitle = () => {
    setIsEditingTitle(false)
    setEditValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEditTitle()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditTitle()
    }
  }

  if (isCompactView) {
    return (
      <div className="flex items-start justify-between">
        <hgroup className="flex flex-col gap-0.5 flex-1">
          <h2 className="text-sm font-medium text-foreground font-mono flex items-center gap-2">
            {session.archived && <Archive className="h-3 w-3 text-muted-foreground" />}
            {isEditingTitle ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  aria-label="Edit session title"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-6 text-xs font-mono"
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={saveEditTitle} className="h-6 px-1 text-xs">
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelEditTitle}
                  className="h-6 px-1 text-xs"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <span>
                  {session.title || session.summary || truncate(session.query, 50)}{' '}
                  {session.parent_session_id && (
                    <span className="text-muted-foreground">[continued]</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={startEditTitle}
                  className="h-4 w-4 p-0 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </>
            )}
          </h2>
          <small
            className={`font-mono text-xs uppercase tracking-wider ${getStatusTextClass(session.status)}`}
          >
            {`${session.status}${session.model ? ` / ${session.model}` : ''}`}
          </small>
        </hgroup>
        <ForkViewModal
          events={events}
          selectedEventIndex={previewEventIndex}
          onSelectEvent={onForkSelect}
          isOpen={forkViewOpen}
          onOpenChange={setForkViewOpen}
          sessionStatus={session.status}
        />
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between">
      <hgroup className="flex flex-col gap-1 flex-1">
        <h2 className="text-lg font-medium text-foreground font-mono flex items-center gap-2">
          {session.archived && <Archive className="h-4 w-4 text-muted-foreground" />}
          {isEditingTitle ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                aria-label="Edit session title"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 text-sm font-mono"
                autoFocus
              />
              <Button size="sm" variant="ghost" onClick={saveEditTitle} className="h-7 px-2">
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEditTitle} className="h-7 px-2">
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <span>
                {session.title || session.summary || truncate(session.query, 50)}{' '}
                {session.parent_session_id && (
                  <span className="text-muted-foreground">[continued]</span>
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={startEditTitle}
                className="h-5 w-5 p-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </>
          )}
        </h2>
        <small
          className={`font-mono text-xs uppercase tracking-wider ${getStatusTextClass(session.status)}`}
        >
          {`${session.status}${session.model ? ` / ${session.model}` : ''}`}
        </small>
        {session.working_dir && (
          <small className="font-mono text-xs text-muted-foreground">{session.working_dir}</small>
        )}
      </hgroup>
      <ForkViewModal
        events={events}
        selectedEventIndex={previewEventIndex}
        onSelectEvent={onForkSelect}
        isOpen={forkViewOpen}
        onOpenChange={setForkViewOpen}
        sessionStatus={session.status}
      />
    </div>
  )
}
