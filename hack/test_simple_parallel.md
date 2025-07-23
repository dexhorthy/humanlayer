# Simple Parallel Approval Test

## Test Command (using commands not in allow list)
```bash
npx humanlayer launch --daemon-socket ~/.humanlayer/daemon-dev.sock -w $PWD --model sonnet "Use the Bash tool to run these 3 commands in parallel: 'curl -s https://example.com | head -5', 'wget -q -O - https://example.com | head -5', 'uname -a'. Make sure to call all three Bash tools in a single response."
```

## Key Points
- `curl`, `wget`, and `uname` are NOT in the allow list
- All three should require approval
- Session should stay in waiting_input until ALL are resolved

## Verification Steps

1. After launching, immediately check approvals:
```bash
# Replace SESSION_ID with actual ID from launch output
SESSION_ID="YOUR_SESSION_ID"
sqlite3 ~/.humanlayer/dev/daemon-2025-07-22-07-08-53.db "SELECT COUNT(*) as pending_count FROM approvals WHERE session_id = '$SESSION_ID' AND status = 'pending';"
```

2. Check session status:
```bash
sqlite3 ~/.humanlayer/dev/daemon-2025-07-22-07-08-53.db "SELECT status FROM sessions WHERE id = '$SESSION_ID';"
```

3. Approve one approval and check status remains waiting_input:
```bash
# Get first approval ID
APPROVAL_ID=$(sqlite3 ~/.humanlayer/dev/daemon-2025-07-22-07-08-53.db "SELECT id FROM approvals WHERE session_id = '$SESSION_ID' AND status = 'pending' LIMIT 1;")

# Approve it via RPC
echo "{\"jsonrpc\":\"2.0\",\"method\":\"approveToolCall\",\"params\":{\"id\":\"$APPROVAL_ID\",\"comment\":\"approved\"},\"id\":1}" | nc -U ~/.humanlayer/daemon-dev.sock

# Check session status (should still be waiting_input)
sqlite3 ~/.humanlayer/dev/daemon-2025-07-22-07-08-53.db "SELECT status FROM sessions WHERE id = '$SESSION_ID';"
```

## Using HumanLayer CLI Debug Commands

```bash
# Monitor session timeline in real-time (run in separate terminal)
watch -n 1 'npx humanlayer sessions show last --timeline --daemon-socket ~/.humanlayer/daemon-dev.sock'

# List all pending approvals
npx humanlayer approvals list --pending --daemon-socket ~/.humanlayer/daemon-dev.sock

# Show current session status
npx humanlayer sessions show last --daemon-socket ~/.humanlayer/daemon-dev.sock

# Approve first approval
npx humanlayer approve last --daemon-socket ~/.humanlayer/daemon-dev.sock

# Check that session is still in waiting_input (2 approvals remaining)
npx humanlayer sessions show last --daemon-socket ~/.humanlayer/daemon-dev.sock
npx humanlayer approvals list --pending --daemon-socket ~/.humanlayer/daemon-dev.sock

# Approve second approval
npx humanlayer approve last --daemon-socket ~/.humanlayer/daemon-dev.sock

# Check that session is still in waiting_input (1 approval remaining)
npx humanlayer sessions show last --daemon-socket ~/.humanlayer/daemon-dev.sock

# Approve third approval
npx humanlayer approve last --daemon-socket ~/.humanlayer/daemon-dev.sock

# Session should now transition to running
npx humanlayer sessions show last --timeline --daemon-socket ~/.humanlayer/daemon-dev.sock
```
