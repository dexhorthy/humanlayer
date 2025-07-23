# Testing Parallel Approvals Fix for ENG-1632

## Context

You are testing a critical fix for ENG-1632 that resolves issues with parallel approval handling and event emission in the HumanLayer daemon. The fix has already been implemented in `hld/approval/manager.go`.

### The Problem
1. **Missing Event Emission**: The approval manager wasn't emitting `EventSessionStatusChanged` events when updating session status, causing the WUI loader to disappear
2. **Parallel Approval Race Condition**: When multiple tools required approval simultaneously, approving the first one would transition the session to "running" status, making remaining approvals unprocessable

### The Fix (Already Implemented)
1. **Event Emission**: Added event publishing in `updateSessionStatus` method (lines 346-363)
2. **Parallel Approval Handling**: Modified `ApproveToolCall` and `DenyToolCall` to check for other pending approvals before transitioning to "running" (lines 153-188)

## Your Task

Execute the test scenarios in `hack/test_parallel_approvals.md` and `hack/test_simple_parallel.md` to verify the fixes are working correctly.

### Prerequisites
1. **Start the dev daemon** (if not already running):
   ```bash
   make daemon
   ```
   Wait for: `daemon started socket=/Users/dex/.humanlayer/daemon-dev.sock`

2. **Verify daemon is running**:
   ```bash
   ps aux | grep hld-dev | grep -v grep
   ls -la ~/.humanlayer/daemon-dev.sock
   ```

### Test 1: Sleep and Echo Script Test

Follow the instructions in `hack/test_parallel_approvals.md`:

1. **Launch the test session** with the sleep_and_echo.sh script
2. **Monitor the daemon logs** in a separate terminal to see status transitions
3. **Use the HumanLayer CLI commands** to track approvals and session status
4. **Verify the expected behavior**:
   - Two approvals should be created for the two Bash commands
   - Session should transition to `waiting_input` when approvals are created
   - After approving the FIRST approval, session should REMAIN in `waiting_input`
   - After approving the SECOND approval, session should transition to `running`

### Test 2: Three Parallel Commands Test

Follow the instructions in `hack/test_simple_parallel.md`:

1. **Launch the test session** with curl, wget, and uname commands
2. **Verify three approvals are created** (these commands are not in the allow list)
3. **Approve them one by one** and verify session stays in `waiting_input` until the last one
4. **Check the timeline** to ensure all status transitions have corresponding events

### Key Verification Points

1. **Event Emission**: Look for `published session status change event` in daemon logs
2. **Parallel Approval Logic**: Look for these log messages:
   - `"keeping session in waiting_input status" with "other_pending_approvals: N"`
   - `"transitioning to running - no other pending approvals"`
3. **Timeline Completeness**: Use `npx humanlayer sessions show last --timeline` to verify:
   - STATUS_CHANGED events appear after each approval
   - No missing events between state transitions

### Troubleshooting

If approvals aren't being created:
- Check if commands are in the allow list: `cat .claude/settings.local.json | grep -i "command"`
- Ensure the MCP approval server is configured (check daemon logs for MCP config)

If daemon connection fails:
- Verify socket path: `~/.humanlayer/daemon-dev.sock`
- Check daemon logs: `tail -50 ~/.humanlayer/logs/daemon-dev-*.log`

### Success Criteria

The fix is working correctly if:
1. ✅ All approvals are created for parallel tool calls
2. ✅ Session stays in `waiting_input` until ALL approvals are resolved
3. ✅ Each status change has a corresponding event in the logs
4. ✅ The timeline shows complete event flow with no gaps

## Files Reference

- **Test Scripts**:
  - `hack/test_parallel_approvals.md` - Uses sleep_and_echo.sh script
  - `hack/test_simple_parallel.md` - Uses curl/wget/uname commands
  - `hack/sleep_and_echo.sh` - Helper script for testing
- **Implementation**: `hld/approval/manager.go` (lines 150-190 for parallel logic, 346-363 for event emission)
- **Debug Guide**: `debugging.md` - Full list of CLI commands and troubleshooting tips
- **Original Ticket**: `thoughts/searchable/shared/tickets/eng-1632.md`

## Important Notes

- Always use `--daemon-socket ~/.humanlayer/daemon-dev.sock` for dev daemon
- The `.claude/settings.local.json` has many auto-allowed commands that bypass approvals
- Commands like `echo`, `ls`, `pwd` are auto-allowed, so use commands NOT in the allow list
- The daemon must be rebuilt (`make daemon`) for code changes to take effect

Good luck with the testing! The implementation should handle all the edge cases correctly.
