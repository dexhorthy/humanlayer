import chalk from 'chalk'
import { connectWithRetry } from '../daemonClient.js'
import { homedir } from 'os'
import { join } from 'path'

interface SessionsListOptions {
  daemonSocket?: string
  status?: string
  recent?: number
  since?: string
  limit?: number
}

interface SessionsShowOptions {
  daemonSocket?: string
  messages?: boolean
  events?: boolean
  timeline?: boolean
  all?: boolean
}

interface SessionInfo {
  id: string
  run_id: string
  claude_session_id?: string
  parent_session_id?: string
  status: string
  query: string
  summary?: string
  title?: string
  model?: string
  working_dir?: string
  created_at: string
  last_activity_at: string
  completed_at?: string
  error_message?: string
  cost_usd?: number
  total_tokens?: number
  duration_ms?: number
  auto_accept_edits?: boolean
  archived?: boolean
  agent_name?: string
}

export async function sessionsListCommand(options: SessionsListOptions): Promise<void> {
  const socketPath = options.daemonSocket || join(homedir(), '.humanlayer', 'daemon.sock')

  try {
    const client = await connectWithRetry(socketPath)

    // Get all sessions from the daemon
    const response = await client.listSessions()
    let sessions = response.sessions as SessionInfo[]

    // Apply filters
    if (options.status) {
      sessions = sessions.filter(s => s.status === options.status)
    }

    if (options.since) {
      // Parse "1 hour ago", "2 days ago", etc.
      const match = options.since.match(/^(\d+)\s+(hour|day|minute)s?\s+ago$/i)
      if (match) {
        const amount = parseInt(match[1])
        const unit = match[2].toLowerCase()
        const ms = unit === 'hour' ? amount * 60 * 60 * 1000 :
                   unit === 'day' ? amount * 24 * 60 * 60 * 1000 :
                   amount * 60 * 1000
        const cutoff = new Date(Date.now() - ms)
        sessions = sessions.filter(s => new Date(s.created_at) > cutoff)
      } else {
        // Assume ISO date
        const cutoff = new Date(options.since)
        sessions = sessions.filter(s => new Date(s.created_at) > cutoff)
      }
    }

    // Sort by created_at descending (most recent first)
    sessions.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // Apply limit
    if (options.limit || options.recent) {
      sessions = sessions.slice(0, options.limit || options.recent || 10)
    }

    if (sessions.length === 0) {
      console.log(chalk.yellow('No sessions found'))
    } else {
      console.log(chalk.bold(`\nFound ${sessions.length} session${sessions.length === 1 ? '' : 's'}:\n`))

      for (const session of sessions) {
        const statusColor = session.status === 'running' ? chalk.green :
                          session.status === 'waiting_input' ? chalk.yellow :
                          session.status === 'completed' ? chalk.blue :
                          session.status === 'failed' ? chalk.red :
                          chalk.gray

        console.log(chalk.bold(`ID: ${session.id}`))
        console.log(`  Status: ${statusColor(session.status)}`)
        console.log(`  Agent: ${chalk.cyan(session.agent_name || 'unknown')}`)
        console.log(`  Created: ${session.created_at ? new Date(session.created_at).toLocaleString() : 'Unknown'}`)

        if (session.updated_at) {
          console.log(`  Updated: ${new Date(session.updated_at).toLocaleString()}`)
        }

        if (session.query) {
          const queryPreview = session.query.length > 60 ?
            session.query.substring(0, 57) + '...' : session.query
          console.log(`  Query: ${chalk.italic(queryPreview)}`)
        }

        console.log() // Empty line between sessions
      }
    }

    client.close()
  } catch (error) {
    console.error(chalk.red('Failed to list sessions:'), error)
    process.exit(1)
  }
}

export async function sessionsShowCommand(sessionId: string, options: SessionsShowOptions): Promise<void> {
  const socketPath = options.daemonSocket || join(homedir(), '.humanlayer', 'daemon.sock')

  try {
    const client = await connectWithRetry(socketPath)

    // Handle "last" as a special case
    if (sessionId === 'last' || sessionId === '--last') {
      const response = await client.listSessions()
      const sessions = response.sessions as SessionInfo[]

      if (sessions.length === 0) {
        console.log(chalk.yellow('No sessions found'))
        client.close()
        return
      }

      // Sort by created_at descending and get the most recent
      sessions.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      sessionId = sessions[0].id
    }

    // Get session details using RPC
    const sessionResponse = await client.call<{session: SessionInfo}>('getSessionState', { session_id: sessionId })
    const session = sessionResponse.session

    // Display basic session info
    console.log(chalk.bold(`\nSession: ${session.id}`))
    console.log(`Status: ${chalk.cyan(session.status)}`)
    console.log(`Agent: ${session.model || 'unknown'}`)
    console.log(`Created: ${new Date(session.created_at).toLocaleString()}`)
    if (session.last_activity_at) {
      console.log(`Last Activity: ${new Date(session.last_activity_at).toLocaleString()}`)
    }
    if (session.query) {
      console.log(`Query: ${chalk.italic(session.query)}`)
    }
    console.log()

    // Show timeline if requested
    if (options.timeline || options.all) {
      console.log(chalk.bold('Timeline:'))

      // Get conversation events
      const convResponse = await client.call<{events: any[]}>('getConversation', { session_id: sessionId })
      const conversationEvents = convResponse.events || []

      // Get approvals
      const approvals = await client.fetchApprovals(sessionId) || []

      // Build timeline from events
      const timeline: any[] = []

      // Process conversation events
      for (const event of conversationEvents) {
        if (event.event_type === 'tool_use') {
          timeline.push({
            time: new Date(event.created_at),
            type: 'tool_request',
            tool: event.tool_name,
            id: event.tool_id,
            approval_status: event.approval_status
          })
        }
      }

      // Add approval events
      for (const approval of approvals) {
        timeline.push({
          time: new Date(approval.created_at),
          type: 'approval_needed',
          tool: approval.tool_name,
          id: approval.id,
          status: approval.status
        })

        if (approval.responded_at) {
          timeline.push({
            time: new Date(approval.responded_at),
            type: 'approval_resolved',
            tool: approval.tool_name,
            id: approval.id,
            decision: approval.status
          })
        }
      }

      // Sort timeline by time
      timeline.sort((a, b) => a.time.getTime() - b.time.getTime())

      // Display timeline
      let lastStatus = 'starting'
      const statusChanges: any[] = []

      // Track session start
      statusChanges.push({
        time: new Date(session.created_at),
        from: null,
        to: 'starting'
      })

      console.log(`${new Date(session.created_at).toLocaleTimeString()} [SESSION_STARTED] Session created`)

      // If status went to running, track that
      if (session.status !== 'starting') {
        statusChanges.push({
          time: new Date(session.created_at),
          from: 'starting',
          to: 'running'
        })
        console.log(`${new Date(session.created_at).toLocaleTimeString()} [STATUS_CHANGED] starting → running`)
        lastStatus = 'running'
      }

      for (const event of timeline) {
        const timeStr = event.time.toLocaleTimeString()

        if (event.type === 'approval_needed') {
          console.log(`${timeStr} [APPROVAL_NEEDED] Tool: ${event.tool}`)
          if (lastStatus !== 'waiting_input') {
            console.log(`${timeStr} [STATUS_CHANGED] ${lastStatus} → waiting_input`)
            statusChanges.push({
              time: event.time,
              from: lastStatus,
              to: 'waiting_input'
            })
            lastStatus = 'waiting_input'
          }
        } else if (event.type === 'approval_resolved') {
          const decision = event.decision === 'approved' ? chalk.green('Approved') : chalk.red('Denied')
          console.log(`${timeStr} [APPROVAL_RESOLVED] ${decision}`)

          // Check if status should change back to running
          if (event.decision === 'approved' && lastStatus === 'waiting_input') {
            // Look for any status change event after this
            const nextStatusChange = statusChanges.find(sc => sc.time > event.time)
            if (!nextStatusChange) {
              console.log(chalk.red(`${timeStr} [STATUS_CHANGED] waiting_input → running ← Missing event!`))
            }
          }
        }
      }

      // Show completion
      if (session.completed_at) {
        console.log(`${new Date(session.completed_at).toLocaleTimeString()} [SESSION_COMPLETED] Session finished`)
      }

      // Check for issues
      console.log(chalk.bold('\nEvents Missing:'))
      let hasIssues = false

      // Check each approval resolution
      for (const approval of approvals) {
        if (approval.status === 'approved' && approval.responded_at) {
          // Should have status change after approval
          const approvalTime = new Date(approval.responded_at).getTime()
          const hasStatusChangeAfter = statusChanges.some(sc =>
            sc.time.getTime() > approvalTime &&
            sc.from === 'waiting_input' &&
            sc.to === 'running'
          )

          if (!hasStatusChangeAfter) {
            console.log(chalk.red(`- EventSessionStatusChanged after approval at ${new Date(approval.responded_at).toLocaleTimeString()}`))
            hasIssues = true
          }
        }
      }

      if (!hasIssues) {
        console.log(chalk.gray('- None detected'))
      }
    }

    // Show messages if requested
    if (options.messages || options.all) {
      console.log(chalk.bold('\nMessages:'))

      // Get conversation events
      const convResponse = await client.call<{events: any[]}>('getConversation', { session_id: sessionId })
      const events = convResponse.events || []

      let messageCount = 0
      for (const event of events) {
        if (event.role) {
          // It's a message event
          messageCount++
          const role = event.role === 'user' ? chalk.blue('User') :
                      event.role === 'assistant' ? chalk.green('Assistant') :
                      chalk.gray('System')
          const content = event.content || '[no content]'
          console.log(`${messageCount}. ${role}: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`)
        }
      }

      if (messageCount === 0) {
        console.log(chalk.gray('No messages found'))
      }
    }

    client.close()
  } catch (error) {
    console.error(chalk.red('Failed to show session:'), error)
    process.exit(1)
  }
}
