# Test Parallel Approvals

## Test Command
```bash
npx humanlayer launch --daemon-socket ~/.humanlayer/daemon-dev.sock -w $PWD --model sonnet "Run the hack/sleep_and_echo.sh script with two BASH() commands with different args: 'first' and 'second'. Execute them in parallel."
```

## Expected Behavior

1. Claude should call Bash tool twice in parallel:
   - `Bash("/tmp/sleep_and_echo.sh first")`
   - `Bash("/tmp/sleep_and_echo.sh second")`

2. Two approvals should be created immediately

3. Session status should change from "running" to "waiting_input"

4. When approving the FIRST approval:
   - The approval should be marked as approved
   - Session should REMAIN in "waiting_input" status (because there's still one pending)
   - Log should show: "keeping session in waiting_input status" with "other_pending_approvals: 1"

5. When approving the SECOND approval:
   - The approval should be marked as approved
   - Session should transition to "running" status
   - Log should show: "transitioning to running - no other pending approvals"

## Monitor Commands

```bash
# Watch daemon logs
sleep 3 && tail -n 100 ~/.humanlayer/logs/daemon-dev-*.log | grep -E "(approval|status_changed|waiting_input|other_pending)"

# Check approvals in database
sqlite3 ~/.humanlayer/dev/daemon-2025-07-22-07-08-53.db "SELECT id, tool_name, status FROM approvals WHERE session_id = 'SESSION_ID_HERE';"

# Check session status
sqlite3 ~/.humanlayer/dev/daemon-2025-07-22-07-08-53.db "SELECT status FROM sessions WHERE id = 'SESSION_ID_HERE';"
```

## Using HumanLayer CLI Debug Commands

```bash
# List pending approvals
npx humanlayer approvals list --pending --daemon-socket ~/.humanlayer/daemon-dev.sock

# Show session timeline (most useful for debugging status transitions)
npx humanlayer sessions show last --timeline --daemon-socket ~/.humanlayer/daemon-dev.sock

# Approve the first pending approval
npx humanlayer approve last --daemon-socket ~/.humanlayer/daemon-dev.sock

# After approving first, check session status (should still be waiting_input)
npx humanlayer sessions show last --daemon-socket ~/.humanlayer/daemon-dev.sock

# List remaining pending approvals
npx humanlayer approvals list --pending --daemon-socket ~/.humanlayer/daemon-dev.sock

# Approve the second approval
npx humanlayer approve last --daemon-socket ~/.humanlayer/daemon-dev.sock

# Check timeline to verify status transitions
npx humanlayer sessions show last --timeline --daemon-socket ~/.humanlayer/daemon-dev.sock
```
