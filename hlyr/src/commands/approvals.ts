import chalk from 'chalk'
import { connectWithRetry } from '../daemonClient.js'
import { homedir } from 'os'
import { join } from 'path'

interface ApprovalsListOptions {
  daemonSocket?: string
  session?: string
  pending?: boolean
  all?: boolean
  limit?: number
}

export async function approvalsListCommand(options: ApprovalsListOptions): Promise<void> {
  const socketPath = options.daemonSocket || join(homedir(), '.humanlayer', 'daemon.sock')
  
  try {
    const client = await connectWithRetry(socketPath)
    
    // Get all sessions
    const sessions = await client.listSessions()
    let allApprovals: any[] = []
    
    // Fetch approvals for each session
    for (const session of sessions.sessions) {
      // Skip if filtering by session ID
      if (options.session && session.id !== options.session) {
        continue
      }
      
      const approvals = await client.fetchApprovals(session.id)
      if (approvals) {
        allApprovals.push(...approvals)
      }
    }
    
    // Filter by status if requested
    if (options.pending) {
      allApprovals = allApprovals.filter(a => a.status === 'pending')
    }
    
    // Sort by created_at descending (most recent first)
    allApprovals.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    
    // Apply limit if specified
    if (options.limit && options.limit > 0) {
      allApprovals = allApprovals.slice(0, options.limit)
    }
    
    // Display results
    if (allApprovals.length === 0) {
      console.log(chalk.yellow('No approvals found'))
    } else {
      console.log(chalk.bold(`\nFound ${allApprovals.length} approval${allApprovals.length === 1 ? '' : 's'}:\n`))
      
      for (const approval of allApprovals) {
        const statusColor = approval.status === 'pending' ? chalk.yellow :
                          approval.status === 'approved' ? chalk.green :
                          chalk.red
        
        console.log(chalk.bold(`ID: ${approval.id}`))
        console.log(`  Status: ${statusColor(approval.status)}`)
        console.log(`  Tool: ${chalk.cyan(approval.tool_name)}`)
        console.log(`  Session: ${chalk.gray(approval.session_id)}`)
        console.log(`  Created: ${new Date(approval.created_at).toLocaleString()}`)
        
        if (approval.responded_at) {
          console.log(`  Responded: ${new Date(approval.responded_at).toLocaleString()}`)
        }
        
        if (approval.comment) {
          console.log(`  Comment: ${chalk.italic(approval.comment)}`)
        }
        
        // Show a preview of the tool input if it's simple
        if (approval.tool_input) {
          const inputStr = JSON.stringify(approval.tool_input)
          if (inputStr.length <= 100) {
            console.log(`  Input: ${chalk.gray(inputStr)}`)
          } else {
            console.log(`  Input: ${chalk.gray(inputStr.substring(0, 97) + '...')}`)
          }
        }
        
        console.log() // Empty line between approvals
      }
    }
    
    client.close()
  } catch (error) {
    console.error(chalk.red('Failed to list approvals:'), error)
    process.exit(1)
  }
}