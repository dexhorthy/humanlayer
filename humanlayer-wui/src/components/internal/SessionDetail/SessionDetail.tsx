import { useState, useEffect, useCallback, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'

import { ConversationEvent, SessionInfo, ApprovalStatus, SessionStatus } from '@/lib/daemon/types'
import { Card, CardContent } from '@/components/ui/card'
import { useConversation, useKeyboardNavigationProtection } from '@/hooks'
import { daemonClient } from '@/lib/daemon/client'
import { useStore } from '@/stores/appStore'

// Import extracted components
import { ConversationContent } from './views/ConversationContent'
import { ToolResultModal } from './components/ToolResultModal'
import { TodoWidget } from './components/TodoWidget'
import { ResponseInput } from './components/ResponseInput'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AutoAcceptIndicator } from './AutoAcceptIndicator'
import { SessionHeader } from './components/SessionHeader'
import { LoadingStates, ROBOT_VERBS } from './components/LoadingStates'
import { PendingApprovalBar } from './components/PendingApprovalBar'
import { ForkModeIndicator } from './components/ForkModeIndicator'

// Import hooks
import { useSessionActions } from './hooks/useSessionActions'
import { useSessionApprovals } from './hooks/useSessionApprovals'
import { useSessionNavigation } from './hooks/useSessionNavigation'
import { useTaskGrouping } from './hooks/useTaskGrouping'
import { useSessionClipboard } from './hooks/useSessionClipboard'
import { useStealHotkeyScope } from '@/hooks/useStealHotkeyScope'

interface SessionDetailProps {
  session: SessionInfo
  onClose: () => void
}

export const SessionDetailHotkeysScope = 'session-detail'

function SessionDetail({ session, onClose }: SessionDetailProps) {
  const [isWideView, setIsWideView] = useState(false)
  const [isCompactView, setIsCompactView] = useState(false)
  const [expandedToolResult, setExpandedToolResult] = useState<ConversationEvent | null>(null)
  const [expandedToolCall, setExpandedToolCall] = useState<ConversationEvent | null>(null)
  const [isSplitView, setIsSplitView] = useState(false)
  const [forkViewOpen, setForkViewOpen] = useState(false)
  const [previewEventIndex, setPreviewEventIndex] = useState<number | null>(null)
  const [pendingForkMessage, setPendingForkMessage] = useState<ConversationEvent | null>(null)
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  // Keyboard navigation protection
  const { shouldIgnoreMouseEvent, startKeyboardNavigation } = useKeyboardNavigationProtection()

  const isActivelyProcessing = ['starting', 'running', 'completing'].includes(session.status)
  const responseInputRef = useRef<HTMLTextAreaElement>(null)
  const confirmingArchiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get session from store to access auto_accept_edits
  const sessionFromStore = useStore(state => state.sessions.find(s => s.id === session.id))
  const autoAcceptEdits = sessionFromStore?.auto_accept_edits ?? false

  // Generate random verb that changes every 10-20 seconds
  const [randomVerb, setRandomVerb] = useState(() => {
    const verb = ROBOT_VERBS[Math.floor(Math.random() * ROBOT_VERBS.length)]
    return verb.charAt(0).toUpperCase() + verb.slice(1)
  })

  useEffect(() => {
    if (!isActivelyProcessing) return

    const changeVerb = () => {
      const verb = ROBOT_VERBS[Math.floor(Math.random() * ROBOT_VERBS.length)]
      setRandomVerb(verb.charAt(0).toUpperCase() + verb.slice(1))
    }

    let intervalId: ReturnType<typeof setTimeout>

    // Function to schedule next change
    const scheduleNextChange = () => {
      const delay = 2000 + Math.random() * 18000 // 2-20 seconds
      intervalId = setTimeout(() => {
        changeVerb()
        scheduleNextChange() // Schedule the next change
      }, delay)
    }

    // Start the first scheduled change
    scheduleNextChange()

    // Cleanup
    return () => {
      if (intervalId) clearTimeout(intervalId)
    }
  }, [isActivelyProcessing])

  // Get events for sidebar access
  const { events } = useConversation(session.id)

  // Use task grouping
  const { hasSubTasks, expandedTasks, toggleTaskGroup } = useTaskGrouping(events)

  // Use navigation hook
  const navigation = useSessionNavigation({
    events,
    hasSubTasks,
    expandedTasks,
    toggleTaskGroup,
    expandedToolResult,
    setExpandedToolResult,
    setExpandedToolCall,
    disabled: forkViewOpen, // Disable navigation when fork view is open
    startKeyboardNavigation,
  })

  // Use approvals hook
  const approvals = useSessionApprovals({
    sessionId: session.id,
    events,
    focusedEventId: navigation.focusedEventId,
    setFocusedEventId: navigation.setFocusedEventId,
    setFocusSource: navigation.setFocusSource,
  })

  // Use clipboard hook
  const focusedEvent = events.find(e => e.id === navigation.focusedEventId) || null
  useSessionClipboard(focusedEvent, !expandedToolResult && !forkViewOpen)

  // Add fork commit handler
  const handleForkCommit = useCallback(() => {
    // Reset preview state after successful fork
    setPreviewEventIndex(null)
    setPendingForkMessage(null)
    setForkViewOpen(false)
  }, [])

  // Use session actions hook
  const actions = useSessionActions({
    session,
    onClose,
    pendingForkMessage,
    onForkCommit: handleForkCommit,
  })

  // Add fork selection handler
  const handleForkSelect = useCallback(
    (eventIndex: number | null) => {
      if (eventIndex === null) {
        // Return to current state - clear everything
        setPreviewEventIndex(null)
        setPendingForkMessage(null)
        // Also clear the response input when selecting "Current"
        actions.setResponseInput('')
        return
      }

      // Set preview mode
      setPreviewEventIndex(eventIndex)

      // Find the selected user message
      const selectedEvent = events[eventIndex]
      if (selectedEvent?.event_type === 'message' && selectedEvent?.role === 'user') {
        // Find the session ID from the event before this one
        const previousEvent = eventIndex > 0 ? events[eventIndex - 1] : null
        const forkFromSessionId = previousEvent?.session_id || session.id

        // Store both the message content and the session ID to fork from
        setPendingForkMessage({
          ...selectedEvent,
          session_id: forkFromSessionId, // Override with the previous event's session ID
        })
      }
    },
    [events, actions],
  )

  // We no longer automatically clear preview when closing
  // This allows the preview to persist after selecting with Enter

  // Screen size detection for responsive layout
  useEffect(() => {
    const checkScreenSize = () => {
      setIsWideView(window.innerWidth >= 1024) // lg breakpoint
      // Consider compact view for heights less than 800px
      setIsCompactView(window.innerHeight < 800)
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // Scroll to bottom when session opens
  useEffect(() => {
    // Scroll to bottom of conversation
    const container = document.querySelector('[data-conversation-container]')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [session.id]) // Re-run when session changes

  // Cleanup confirmation timeout on unmount or session change
  useEffect(() => {
    return () => {
      if (confirmingArchiveTimeoutRef.current) {
        clearTimeout(confirmingArchiveTimeoutRef.current)
        confirmingArchiveTimeoutRef.current = null
      }
    }
  }, [session.id])

  // Check if there are pending approvals out of view
  const [hasPendingApprovalsOutOfView, setHasPendingApprovalsOutOfView] = useState(false)

  const lastTodo = events
    ?.toReversed()
    .find(e => e.event_type === 'tool_call' && e.tool_name === 'TodoWrite')

  // Clear focus on escape, then close if nothing focused
  // This needs special handling for confirmingApprovalId

  useHotkeys(
    'escape',
    ev => {
      if ((ev.target as HTMLElement)?.dataset.slot === 'dialog-close') {
        console.warn('Ignoring onClose triggered by dialog-close in SessionDetail')
        return null
      }

      // Don't process escape if fork view is open
      if (forkViewOpen) {
        return
      }

      // If the textarea is focused, blur it and stop processing
      if (ev.target === responseInputRef.current && responseInputRef.current) {
        responseInputRef.current.blur()
        return
      }

      if (confirmingArchive) {
        setConfirmingArchive(false)
        // Clear timeout if exists
        if (confirmingArchiveTimeoutRef.current) {
          clearTimeout(confirmingArchiveTimeoutRef.current)
          confirmingArchiveTimeoutRef.current = null
        }
      } else if (approvals.confirmingApprovalId) {
        approvals.setConfirmingApprovalId(null)
      } else if (navigation.focusedEventId) {
        navigation.setFocusedEventId(null)
      } else {
        onClose()
      }
    },
    {
      scopes: SessionDetailHotkeysScope,
      enableOnFormTags: true, // Enable escape key in form elements like textarea
    },
  )

  // Add Shift+Tab handler for auto-accept edits mode
  useHotkeys(
    'shift+tab',
    async () => {
      try {
        const newState = !autoAcceptEdits
        await daemonClient.updateSessionSettings(session.id, {
          autoAcceptEdits: newState,
        })

        // State will be updated via event subscription
      } catch (error) {
        console.error('Failed to toggle auto-accept mode:', error)
      }
    },
    {
      scopes: [SessionDetailHotkeysScope],
      preventDefault: true,
    },
    [session.id, autoAcceptEdits], // Dependencies
  )

  // Add hotkey to archive session ('e' key)
  useHotkeys(
    'e',
    async () => {
      // TODO(3): The timeout clearing logic (using confirmingArchiveTimeoutRef) is duplicated in multiple places.
      // Consider refactoring this into a helper function to reduce repetition.

      // Clear any existing timeout
      if (confirmingArchiveTimeoutRef.current) {
        clearTimeout(confirmingArchiveTimeoutRef.current)
        confirmingArchiveTimeoutRef.current = null
      }

      // Check if session is active (requires confirmation)
      const isActiveSession = [
        SessionStatus.Starting,
        SessionStatus.Running,
        SessionStatus.Completing,
        SessionStatus.WaitingInput,
      ].includes(session.status)

      const isArchiving = !session.archived

      if (isActiveSession && !confirmingArchive) {
        // First press - show warning
        setConfirmingArchive(true)
        // TODO(3): Consider using a Dialog instead of toast for archive confirmation.
        // This would improve accessibility (mouse users can click buttons) and avoid
        // complexity around timeout management. The current toast approach works but
        // isn't ideal for all users.
        toast.warning('Press e again to archive active session', {
          description: 'This session is still active. Press e again within 3 seconds to confirm.',
          duration: 3000,
        })

        // Set timeout to reset confirmation state
        confirmingArchiveTimeoutRef.current = setTimeout(() => {
          setConfirmingArchive(false)
          confirmingArchiveTimeoutRef.current = null
        }, 3000)
        return
      }

      // Either second press for active session or immediate archive for completed/failed
      try {
        await useStore.getState().archiveSession(session.id, isArchiving)

        // Clear confirmation state
        setConfirmingArchive(false)

        // Show success notification matching list view behavior
        toast.success(isArchiving ? 'Session archived' : 'Session unarchived', {
          description: session.summary || 'Untitled session',
          duration: 3000,
        })

        // Navigate back to session list
        onClose()
      } catch (error) {
        toast.error('Failed to archive session', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
        setConfirmingArchive(false)
      }
    },
    {
      scopes: [SessionDetailHotkeysScope],
      preventDefault: true,
    },
    [session.id, session.archived, session.summary, session.status, onClose, confirmingArchive],
  )

  // Add hotkey to open fork view (Meta+Y)
  useHotkeys(
    'meta+y',
    e => {
      e.preventDefault()
      setForkViewOpen(!forkViewOpen)
    },
    { scopes: [SessionDetailHotkeysScope] },
  )

  // Add Shift+G hotkey to scroll to bottom
  useHotkeys(
    'shift+g',
    () => {
      startKeyboardNavigation()

      const container = document.querySelector('[data-conversation-container]')
      if (container) {
        container.scrollTop = container.scrollHeight
        // Focus the last event
        if (events.length > 0) {
          navigation.setFocusedEventId(events[events.length - 1].id)
          navigation.setFocusSource('keyboard')
        }
      }
    },
    { scopes: [SessionDetailHotkeysScope] },
    [events, navigation.setFocusedEventId, navigation.setFocusSource],
  )

  // Add 'gg' to jump to top of conversation (vim-style)
  useHotkeys(
    'g>g',
    () => {
      startKeyboardNavigation()

      const container = document.querySelector('[data-conversation-container]')
      if (container) {
        container.scrollTop = 0
        // Focus the first event
        if (events.length > 0) {
          navigation.setFocusedEventId(events[0].id)
          navigation.setFocusSource('keyboard')
        }
      }
    },
    {
      enableOnFormTags: false,
      scopes: [SessionDetailHotkeysScope],
      preventDefault: true,
    },
    [events, navigation.setFocusedEventId, navigation.setFocusSource],
  )

  // Add Enter key to focus text input
  useHotkeys(
    'enter',
    () => {
      if (responseInputRef.current && session.status !== SessionStatus.Failed) {
        responseInputRef.current.focus()
      }
    },
    {
      scopes: SessionDetailHotkeysScope,
      enableOnFormTags: false,
      preventDefault: true,
    },
  )

  useStealHotkeyScope(SessionDetailHotkeysScope)

  // Note: Most hotkeys are handled by the hooks (ctrl+x, r, p, i, a, d)
  // Only the escape key needs special handling here for confirmingApprovalId

  // Check if there are pending approvals out of view when in waiting_input status
  useEffect(() => {
    const checkPendingApprovalVisibility = () => {
      if (session.status === SessionStatus.WaitingInput) {
        const pendingEvent = events.find(e => e.approval_status === ApprovalStatus.Pending)
        if (pendingEvent) {
          const container = document.querySelector('[data-conversation-container]')
          const element = container?.querySelector(`[data-event-id="${pendingEvent.id}"]`)
          if (container && element) {
            // Check if the approve/deny buttons are visible
            // Look for buttons containing the approval keyboard shortcuts
            const buttons = element.querySelectorAll('button')
            let approveButton = null
            buttons.forEach(btn => {
              if (btn.textContent?.includes('Approve') && btn.querySelector('kbd')) {
                approveButton = btn
              }
            })

            const targetElement = approveButton || element
            const elementRect = targetElement.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()

            // Consider the buttons in view if they're at least partially visible
            const inView =
              elementRect.top < containerRect.bottom && elementRect.bottom > containerRect.top

            setHasPendingApprovalsOutOfView(!inView)
          }
        } else {
          setHasPendingApprovalsOutOfView(false)
        }
      } else {
        setHasPendingApprovalsOutOfView(false)
      }
    }

    // Initial check
    checkPendingApprovalVisibility()

    // Add scroll listener
    const container = document.querySelector('[data-conversation-container]')
    if (container) {
      container.addEventListener('scroll', checkPendingApprovalVisibility)
      return () => container.removeEventListener('scroll', checkPendingApprovalVisibility)
    }
  }, [session.status, events])

  return (
    <section className={`flex flex-col h-full ${isCompactView ? 'gap-2' : 'gap-4'}`}>
      <SessionHeader
        session={session}
        events={events}
        previewEventIndex={previewEventIndex}
        onForkSelect={handleForkSelect}
        forkViewOpen={forkViewOpen}
        setForkViewOpen={setForkViewOpen}
        isCompactView={isCompactView}
      />

      <ForkModeIndicator previewEventIndex={previewEventIndex} events={events} />

      <div className={`flex flex-1 gap-4 ${isWideView ? 'flex-row' : 'flex-col'} min-h-0`}>
        {/* Conversation content and Loading */}
        <Card
          className={`${isWideView ? 'flex-1' : 'w-full'} relative ${isCompactView ? 'py-2' : 'py-4'} flex flex-col min-h-0`}
        >
          <CardContent className={`${isCompactView ? 'px-2' : 'px-4'} flex flex-col flex-1 min-h-0`}>
            <ConversationContent
              sessionId={session.id}
              focusedEventId={navigation.focusedEventId}
              setFocusedEventId={navigation.setFocusedEventId}
              onApprove={approvals.handleApprove}
              onDeny={approvals.handleDeny}
              approvingApprovalId={approvals.approvingApprovalId}
              confirmingApprovalId={approvals.confirmingApprovalId}
              denyingApprovalId={approvals.denyingApprovalId}
              setDenyingApprovalId={approvals.setDenyingApprovalId}
              onCancelDeny={approvals.handleCancelDeny}
              isSplitView={isSplitView}
              onToggleSplitView={() => setIsSplitView(!isSplitView)}
              focusSource={navigation.focusSource}
              setFocusSource={navigation.setFocusSource}
              setConfirmingApprovalId={approvals.setConfirmingApprovalId}
              expandedToolResult={expandedToolResult}
              setExpandedToolResult={setExpandedToolResult}
              setExpandedToolCall={setExpandedToolCall}
              maxEventIndex={previewEventIndex ?? undefined}
              shouldIgnoreMouseEvent={shouldIgnoreMouseEvent}
              expandedTasks={expandedTasks}
              toggleTaskGroup={toggleTaskGroup}
            />
            {isActivelyProcessing && <LoadingStates randomVerb={randomVerb} />}

            <PendingApprovalBar
              hasPendingApprovalsOutOfView={hasPendingApprovalsOutOfView}
              onClick={() => {
                const container = document.querySelector('[data-conversation-container]')
                if (container) {
                  container.scrollTop = container.scrollHeight
                }
              }}
            />
          </CardContent>
        </Card>

        {isWideView && lastTodo && (
          <Card className="w-[20%]">
            <CardContent>
              <TodoWidget event={lastTodo} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Response input - always show but disable for non-completed sessions */}
      <Card className={isCompactView ? 'py-2' : 'py-4'}>
        <CardContent className={isCompactView ? 'px-2' : 'px-4'}>
          <ResponseInput
            ref={responseInputRef}
            session={session}
            responseInput={actions.responseInput}
            setResponseInput={actions.setResponseInput}
            isResponding={actions.isResponding}
            handleContinueSession={actions.handleContinueSession}
            handleResponseInputKeyDown={actions.handleResponseInputKeyDown}
            isForkMode={actions.isForkMode}
            onOpenForkView={() => setForkViewOpen(true)}
          />
          <AutoAcceptIndicator enabled={autoAcceptEdits} className="mt-2" />
        </CardContent>
      </Card>

      {/* Tool Result Expansion Modal */}
      {expandedToolResult && (
        <ToolResultModal
          toolCall={expandedToolCall}
          toolResult={expandedToolResult}
          onClose={() => {
            setExpandedToolResult(null)
            setExpandedToolCall(null)
          }}
        />
      )}
    </section>
  )
}

// Export wrapped component
const SessionDetailWithErrorBoundary = (props: SessionDetailProps) => (
  <ErrorBoundary>
    <SessionDetail {...props} />
  </ErrorBoundary>
)

export default SessionDetailWithErrorBoundary
