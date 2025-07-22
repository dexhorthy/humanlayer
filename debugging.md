# HumanLayer Debugging Guide

This guide covers debugging tools and techniques for troubleshooting HumanLayer approval flows, session states, and event emission issues.

## Quick Start

```bash
# Check pending approvals (using dev daemon)
npx humanlayer approvals list --pending --daemon-socket ~/.humanlayer/daemon-dev.sock

# Approve the last pending approval
npx humanlayer approve last --daemon-socket ~/.humanlayer/daemon-dev.sock

# View session timeline to debug state transitions
npx humanlayer sessions show last --timeline --daemon-socket ~/.humanlayer/daemon-dev.sock

# Pro tip: Set an alias for the dev daemon
alias hldev='npx humanlayer --daemon-socket ~/.humanlayer/daemon-dev.sock'
```

## Debug Commands

### Approval Management

#### List Approvals
```bash
# List all approvals
npx humanlayer approvals list

# Show only pending approvals
npx humanlayer approvals list --pending

# Filter by session
npx humanlayer approvals list --session <session-id>

# Limit results
npx humanlayer approvals list --pending --limit 10
```

#### Approve/Deny Approvals
```bash
# Approve the most recent pending approval
npx humanlayer approve last

# Approve by ID
npx humanlayer approve local-337292f9

# Deny with reason
npx humanlayer deny last --reason "Security concern"
npx humanlayer deny local-337292f9 --reason "Invalid parameters"
```

### Session Inspection

#### List Sessions
```bash
# List recent sessions
npx humanlayer sessions list

# Filter by status
npx humanlayer sessions list --status waiting_input
npx humanlayer sessions list --status running
npx humanlayer sessions list --status completed

# Show recent sessions
npx humanlayer sessions list --recent 5

# Filter by time
npx humanlayer sessions list --since "1 hour ago"
npx humanlayer sessions list --since "2025-07-22T10:00:00Z"
```

#### Show Session Details
```bash
# Show the most recent session
npx humanlayer sessions show last

# Show specific session
npx humanlayer sessions show e4a8ba51-7c2f-4d8a-9b3e-1f2e3d4e5f6a

# Show timeline (most useful for debugging)
npx humanlayer sessions show last --timeline

# Show conversation messages
npx humanlayer sessions show last --messages

# Show everything
npx humanlayer sessions show last --all
```

### Using Different Daemons

```bash
# Use development daemon (recommended for debugging)
npx humanlayer approvals list --daemon-socket ~/.humanlayer/daemon-dev.sock

# Use production/nightly daemon
npx humanlayer approvals list --daemon-socket ~/.humanlayer/daemon.sock
```

**Note**: Most debugging should be done with `daemon-dev.sock` as that's where active development happens.

## Common Debugging Scenarios

### 1. Debugging ENG-1632: Loader Not Reappearing

The issue: After approving a tool, the loader doesn't reappear until the tool finishes executing.

```bash
# Launch a test session
npx humanlayer launch "create a test file" --model opus --daemon-socket ~/.humanlayer/daemon-dev.sock

# Watch the timeline in another terminal
watch -n 1 'npx humanlayer sessions show last --timeline --daemon-socket ~/.humanlayer/daemon-dev.sock'

# When approval is needed, approve it
npx humanlayer approve last --daemon-socket ~/.humanlayer/daemon-dev.sock

# Check the timeline for missing EventSessionStatusChanged
```

Expected timeline:
```
10:30:00 [SESSION_STARTED] Session created
10:30:00 [STATUS_CHANGED] starting → running
10:30:15 [APPROVAL_NEEDED] Tool: Write
10:30:15 [STATUS_CHANGED] running → waiting_input
10:30:20 [APPROVAL_RESOLVED] Approved
10:30:20 [STATUS_CHANGED] waiting_input → running  ← This might be missing!
10:30:25 [SESSION_COMPLETED] Session finished
```

### 2. Finding Stuck Approvals

```bash
# List all pending approvals
npx humanlayer approvals list --pending

# Find old pending approvals
npx humanlayer sessions list --status waiting_input --since "1 day ago"
```

### 3. Debugging Failed Sessions

```bash
# Find failed sessions
npx humanlayer sessions list --status failed --recent 10

# Inspect a failed session
npx humanlayer sessions show <session-id> --all
```

### 4. Monitoring Real-Time Events

```bash
# In one terminal, monitor daemon logs
tail -f ~/.humanlayer/logs/daemon-dev-*.log | grep -E "(status_changed|approval)"

# In another terminal, run approval commands
npx humanlayer approve last
```

## Understanding Timeline Output

The timeline shows a chronological view of session events:

```
Timeline:
13:21:00 [SESSION_STARTED] Session created
13:21:01 [STATUS_CHANGED] starting → running
13:21:42 [APPROVAL_NEEDED] Tool: bash "ls -la"
13:21:43 [STATUS_CHANGED] running → waiting_input
13:21:45 [APPROVAL_RESOLVED] Approved
13:21:45 [STATUS_CHANGED] waiting_input → running  ← Missing = BUG
13:22:07 [SESSION_COMPLETED] Session finished

Events Missing:
- EventSessionStatusChanged after approval at 13:21:45
```

Key indicators:
- **Missing STATUS_CHANGED**: Event emission bug
- **Long gaps**: Performance issues or stuck processes
- **Out-of-order events**: Race conditions

## Direct Database Queries

For advanced debugging, you can query the SQLite database directly:

```bash
# Recent sessions
sqlite3 ~/.humanlayer/daemon.db "
  SELECT id, status, created_at, updated_at 
  FROM sessions 
  ORDER BY created_at DESC 
  LIMIT 10;
"

# Pending approvals
sqlite3 ~/.humanlayer/daemon.db "
  SELECT a.id, a.tool_name, a.status, s.status as session_status
  FROM approvals a
  JOIN sessions s ON a.session_id = s.id
  WHERE a.status = 'pending';
"

# Session events
sqlite3 ~/.humanlayer/daemon.db "
  SELECT event_type, event_data, created_at
  FROM session_events
  WHERE session_id = 'SESSION_ID'
  ORDER BY created_at;
"
```

## Troubleshooting Tips

### Daemon Connection Issues
```bash
# Check if daemon is running
ps aux | grep hld

# Check socket exists
ls -la ~/.humanlayer/daemon*.sock

# Test daemon health
echo '{"jsonrpc":"2.0","method":"health","id":1}' | nc -U ~/.humanlayer/daemon.sock
```

### Approval Not Appearing
1. Check session status: `npx humanlayer sessions show <id>`
2. Check daemon logs for errors: `tail -f ~/.humanlayer/logs/daemon-*.log`
3. Verify approval was created: `npx humanlayer approvals list --session <id>`

### Session Stuck in waiting_input
1. List pending approvals: `npx humanlayer approvals list --pending --session <id>`
2. Check for multiple pending approvals
3. Approve/deny all pending approvals
4. Check if status changes: `npx humanlayer sessions show <id>`

## Environment Variables

```bash
# Enable debug logging
HUMANLAYER_DEBUG=true npx humanlayer approve last

# Use different daemon socket
HUMANLAYER_DAEMON_SOCKET=/tmp/test-daemon.sock npx humanlayer sessions list
```

## Best Practices

1. **Always check the timeline** when debugging state issues
2. **Use --daemon-socket** to ensure you're debugging the right instance
3. **Monitor logs** in a separate terminal while testing
4. **Save problematic session IDs** for later analysis
5. **Use "last" shortcut** for quick testing iterations

## Future Enhancements

Planned improvements to debugging tools:

1. **Auto-approval rules** for automated testing
2. **Event monitoring** with real-time updates
3. **Session export** for sharing debug information
4. **Batch operations** for managing multiple approvals

## Related Documentation

- [ENG-1632 Research](thoughts/shared/research/2025-07-21_13-32-00_eng-1632-root-cause-analysis.md)
- [Debug Tooling Plan](thoughts/shared/plans/2025-07-22-debug-tooling-for-approval-testing.md)