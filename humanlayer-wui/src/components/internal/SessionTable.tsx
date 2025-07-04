import { SessionInfo } from '@/lib/daemon/types'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook'
import { useEffect, useRef } from 'react'
import { CircleOff } from 'lucide-react'
import { getStatusTextClass } from '@/utils/component-utils'
import { highlightMatches } from '@/lib/fuzzy-search'

interface SessionTableProps {
  sessions: SessionInfo[]
  handleFocusSession?: (session: SessionInfo) => void
  handleBlurSession?: () => void
  handleFocusNextSession?: () => void
  handleFocusPreviousSession?: () => void
  handleActivateSession?: (session: SessionInfo) => void
  focusedSession: SessionInfo | null
  searchText?: string
  matchedSessions?: Map<string, any>
}

export const SessionTableHotkeysScope = 'session-table'

export default function SessionTable({
  sessions,
  handleFocusSession,
  handleBlurSession,
  handleFocusNextSession,
  handleFocusPreviousSession,
  handleActivateSession,
  focusedSession,
  searchText,
  matchedSessions,
}: SessionTableProps) {
  const { enableScope, disableScope } = useHotkeysContext()
  const tableRef = useRef<HTMLTableElement>(null)

  // Helper to render highlighted text
  const renderHighlightedText = (text: string, sessionId: string) => {
    if (!searchText || !matchedSessions) return text

    const matchData = matchedSessions.get(sessionId)
    if (!matchData) return text

    // Find matches for the query field
    const queryMatch = matchData.matches?.find((m: any) => m.key === 'query')
    if (!queryMatch || !queryMatch.indices) return text

    const segments = highlightMatches(text, queryMatch.indices)
    return (
      <>
        {segments.map((segment, i) => (
          <span
            key={i}
            className={segment.highlighted ? 'bg-yellow-200/80 dark:bg-yellow-900/60 font-medium' : ''}
          >
            {segment.text}
          </span>
        ))}
      </>
    )
  }

  useEffect(() => {
    enableScope(SessionTableHotkeysScope)
    return () => {
      disableScope(SessionTableHotkeysScope)
    }
  }, [])

  // Scroll focused session into view
  useEffect(() => {
    if (focusedSession && tableRef.current) {
      const focusedRow = tableRef.current.querySelector(`[data-session-id="${focusedSession.id}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedSession])

  useHotkeys('j', () => handleFocusNextSession?.(), { scopes: SessionTableHotkeysScope })
  useHotkeys('k', () => handleFocusPreviousSession?.(), { scopes: SessionTableHotkeysScope })
  useHotkeys(
    'enter',
    () => {
      if (focusedSession) {
        handleActivateSession?.(focusedSession)
      }
    },
    { scopes: SessionTableHotkeysScope },
  )

  return (
    <>
      <Table ref={tableRef}>
        <TableCaption>A list of your recent sessions.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Query</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Last Activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map(session => (
            <TableRow
              key={session.id}
              data-session-id={session.id}
              onMouseEnter={() => handleFocusSession?.(session)}
              onMouseLeave={() => handleBlurSession?.()}
              onClick={() => handleActivateSession?.(session)}
              className={`cursor-pointer ${focusedSession?.id === session.id ? '!bg-accent/20' : ''}`}
            >
              <TableCell className={getStatusTextClass(session.status)}>{session.status}</TableCell>
              <TableCell className="max-w-xs truncate">
                {renderHighlightedText(session.query, session.id)}
              </TableCell>
              <TableCell>{session.model || <CircleOff className="w-4 h-4" />}</TableCell>
              <TableCell>{session.start_time}</TableCell>
              <TableCell>{session.last_activity_at}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sessions.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No sessions found</p>
          {searchText && <p className="text-xs mt-1">Try adjusting your search filters</p>}
        </div>
      )}
    </>
  )
}
