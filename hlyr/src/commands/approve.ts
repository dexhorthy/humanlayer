import chalk from 'chalk'
import { connectWithRetry } from '../daemonClient.js'
import { homedir } from 'os'
import { join } from 'path'

interface ApproveOptions {
  daemonSocket?: string
  reason?: string
}

async function getPendingApprovals(client: any): Promise<any[]> {
  const sessions = await client.listSessions()
  const allApprovals = []

  for (const session of sessions.sessions) {
    if (session.status === 'waiting_input') {
      const approvals = await client.fetchApprovals(session.id)
      if (approvals) {
        const pending = approvals.filter((a: any) => a.status === 'pending')
        allApprovals.push(...pending)
      }
    }
  }

  return allApprovals.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export async function approveCommand(target: string, options: ApproveOptions): Promise<void> {
  const socketPath = options.daemonSocket || join(homedir(), '.humanlayer', 'daemon.sock')

  try {
    const client = await connectWithRetry(socketPath)

    let approvalId: string

    if (target === 'last') {
      // Get the most recent pending approval
      const pendingApprovals = await getPendingApprovals(client)

      if (pendingApprovals.length === 0) {
        console.log(chalk.yellow('No pending approvals found'))
        process.exit(0)
      }

      const approval = pendingApprovals[0]
      approvalId = approval.id

      console.log(chalk.blue('Approving most recent pending approval:'))
      console.log(chalk.gray(`  ID: ${approval.id}`))
      console.log(chalk.gray(`  Tool: ${approval.tool_name}`))
      console.log(chalk.gray(`  Session: ${approval.session_id}`))
      console.log(chalk.gray(`  Created: ${new Date(approval.created_at).toLocaleString()}`))
    } else {
      // Use provided approval ID
      approvalId = target

      // Verify the approval exists and is pending
      try {
        const approval = await client.getApproval(approvalId)
        if (approval.status !== 'pending') {
          console.error(chalk.red(`Approval ${approvalId} is already ${approval.status}`))
          process.exit(1)
        }

        console.log(chalk.blue('Approving:'))
        console.log(chalk.gray(`  ID: ${approval.id}`))
        console.log(chalk.gray(`  Tool: ${approval.tool_name}`))
        console.log(chalk.gray(`  Session: ${approval.session_id}`))
      } catch (err) {
        console.error(chalk.red(`Approval ${approvalId} not found`))
        process.exit(1)
      }
    }

    // Send approval decision
    await client.sendDecision(approvalId, 'approve', options.reason || 'Approved via CLI')

    console.log(chalk.green('✓ Approval sent successfully'))

    client.close()
  } catch (error) {
    console.error(chalk.red('Failed to approve:'), error)
    process.exit(1)
  }
}

export async function denyCommand(target: string, options: ApproveOptions): Promise<void> {
  const socketPath = options.daemonSocket || join(homedir(), '.humanlayer', 'daemon.sock')

  try {
    const client = await connectWithRetry(socketPath)

    let approvalId: string

    if (target === 'last') {
      // Get the most recent pending approval
      const pendingApprovals = await getPendingApprovals(client)

      if (pendingApprovals.length === 0) {
        console.log(chalk.yellow('No pending approvals found'))
        process.exit(0)
      }

      const approval = pendingApprovals[0]
      approvalId = approval.id

      console.log(chalk.blue('Denying most recent pending approval:'))
      console.log(chalk.gray(`  ID: ${approval.id}`))
      console.log(chalk.gray(`  Tool: ${approval.tool_name}`))
      console.log(chalk.gray(`  Session: ${approval.session_id}`))
      console.log(chalk.gray(`  Created: ${new Date(approval.created_at).toLocaleString()}`))
    } else {
      // Use provided approval ID
      approvalId = target

      // Verify the approval exists and is pending
      try {
        const approval = await client.getApproval(approvalId)
        if (approval.status !== 'pending') {
          console.error(chalk.red(`Approval ${approvalId} is already ${approval.status}`))
          process.exit(1)
        }

        console.log(chalk.blue('Denying:'))
        console.log(chalk.gray(`  ID: ${approval.id}`))
        console.log(chalk.gray(`  Tool: ${approval.tool_name}`))
        console.log(chalk.gray(`  Session: ${approval.session_id}`))
      } catch (err) {
        console.error(chalk.red(`Approval ${approvalId} not found`))
        process.exit(1)
      }
    }

    // Send denial decision
    await client.sendDecision(approvalId, 'deny', options.reason || 'Denied via CLI')

    console.log(chalk.green('✓ Denial sent successfully'))

    client.close()
  } catch (error) {
    console.error(chalk.red('Failed to deny:'), error)
    process.exit(1)
  }
}
