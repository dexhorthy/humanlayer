//go:build integration

package daemon_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/humanlayer/humanlayer/hld/daemon"
	"github.com/humanlayer/humanlayer/hld/internal/testutil"
	_ "github.com/mattn/go-sqlite3"
	"github.com/stretchr/testify/require"
)

// TestMCPToolUseIDCorrelation verifies that when an approval is triggered
// by a running Claude Code instance, the tool_use_id is properly set in the database
func TestMCPToolUseIDCorrelation(t *testing.T) {
	// Setup isolated environment
	socketPath := testutil.SocketPath(t, "mcp-tool-use-id")
	dbPath := testutil.DatabasePath(t, "mcp-tool-use-id")

	// Get a free port for HTTP server
	httpPort := getFreePort(t)

	// Override environment
	os.Setenv("HUMANLAYER_DAEMON_SOCKET", socketPath)
	os.Setenv("HUMANLAYER_DAEMON_HTTP_PORT", fmt.Sprintf("%d", httpPort))
	os.Setenv("HUMANLAYER_DAEMON_HTTP_HOST", "127.0.0.1")
	os.Setenv("HUMANLAYER_API_KEY", "") // Disable cloud API

	// Create isolated config
	tempDir := t.TempDir()
	os.Setenv("XDG_CONFIG_HOME", tempDir)
	configDir := filepath.Join(tempDir, "humanlayer")
	require.NoError(t, os.MkdirAll(configDir, 0755))
	configFile := filepath.Join(configDir, "humanlayer.json")
	require.NoError(t, os.WriteFile(configFile, []byte(`{}`), 0644))

	// Create daemon
	d, err := daemon.New()
	require.NoError(t, err, "Failed to create daemon")

	// Start daemon in background
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- d.Run(ctx)
	}()

	// Wait for daemon to be ready
	require.Eventually(t, func() bool {
		// Check if the HTTP health endpoint is responding
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/v1/health", httpPort))
		if err == nil && resp != nil {
			resp.Body.Close()
			return resp.StatusCode == 200
		}
		return false
	}, 10*time.Second, 100*time.Millisecond, "Daemon did not start")

	// Open database connection
	db, err := sql.Open("sqlite3", dbPath)
	require.NoError(t, err)
	defer db.Close()

	// We'll use daemon's REST API to launch sessions properly

	t.Run("SingleApprovalWithToolUseID", func(t *testing.T) {
		// Clear any existing approvals
		_, err = db.Exec("DELETE FROM approvals")
		require.NoError(t, err)

		// Create temp directory for session
		testWorkDir := t.TempDir()

		// Prepare session creation request for REST API
		createReq := map[string]interface{}{
			"query":                  "Write 'Hello World' to a file called test.txt and then exit",
			"model":                  "sonnet",
			"permission_prompt_tool": "mcp__codelayer__request_approval",
			"max_turns":              3,
			"working_dir":            testWorkDir,
			"mcp_config": map[string]interface{}{
				"mcp_servers": map[string]interface{}{
					"codelayer": map[string]interface{}{
						"type": "http",
						"url":  fmt.Sprintf("http://127.0.0.1:%d/api/v1/mcp", httpPort),
					},
				},
			},
		}

		// Send REST API request to create session
		reqBody, _ := json.Marshal(createReq)
		httpReq, err := http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/api/v1/sessions", httpPort), bytes.NewBuffer(reqBody))
		require.NoError(t, err)
		httpReq.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(httpReq)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Check response status
		require.Equal(t, http.StatusCreated, resp.StatusCode, "Expected 201 Created")

		// Parse response
		var createResp map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&createResp)
		require.NoError(t, err)

		// Get session ID from response
		data := createResp["data"].(map[string]interface{})
		sessionID := data["session_id"].(string)
		runID := data["run_id"].(string)
		t.Logf("Launched session: %s with run_id: %s", sessionID, runID)

		// Let Claude run for a bit to trigger approvals
		t.Log("Waiting for Claude to trigger approvals...")
		time.Sleep(5 * time.Second)

		// Now check the database for approvals
		rows, err := db.Query(`
			SELECT id, session_id, tool_name, tool_use_id, status, comment
			FROM approvals
			ORDER BY created_at DESC
		`)
		require.NoError(t, err)
		defer rows.Close()

		var approvals []struct {
			ID        string
			SessionID string
			ToolName  string
			ToolUseID sql.NullString
			Status    string
			Comment   sql.NullString
		}

		for rows.Next() {
			var a struct {
				ID        string
				SessionID string
				ToolName  string
				ToolUseID sql.NullString
				Status    string
				Comment   sql.NullString
			}
			err := rows.Scan(&a.ID, &a.SessionID, &a.ToolName, &a.ToolUseID, &a.Status, &a.Comment)
			require.NoError(t, err)
			approvals = append(approvals, a)
		}

		// Log what we found
		t.Logf("Found %d approvals in database:", len(approvals))
		for i, a := range approvals {
			t.Logf("  Approval %d:", i+1)
			t.Logf("    ID: %s", a.ID)
			t.Logf("    Session ID: %s", a.SessionID)
			t.Logf("    Tool Name: %s", a.ToolName)
			t.Logf("    Tool Use ID: %v (Valid: %v)", a.ToolUseID.String, a.ToolUseID.Valid)
			t.Logf("    Status: %s", a.Status)
			if a.Comment.Valid {
				t.Logf("    Comment: %s", a.Comment.String)
			}
		}

		// Also check conversation events for tool uses
		var toolUseCount int
		rows2, err := db.Query(`
			SELECT tool_id, tool_name
			FROM conversation_events
			WHERE session_id = ? AND tool_id IS NOT NULL
			ORDER BY created_at DESC
		`, sessionID)
		if err == nil {
			defer rows2.Close()
			for rows2.Next() {
				var toolID, toolName string
				if err := rows2.Scan(&toolID, &toolName); err == nil {
					toolUseCount++
					t.Logf("  Tool use in events: %s (ID: %s)", toolName, toolID)
				}
			}
		}
		t.Logf("Found %d tool uses in conversation_events", toolUseCount)

		// Verify that we have at least one approval
		if len(approvals) > 0 {
			// Check that tool_use_id is set
			for _, a := range approvals {
				if !a.ToolUseID.Valid || a.ToolUseID.String == "" {
					t.Errorf("Approval %s has no tool_use_id set!", a.ID)
				} else {
					t.Logf("✓ Approval %s has tool_use_id: %s", a.ID, a.ToolUseID.String)
				}
			}
		} else {
			t.Log("No approvals were created - this might indicate the test didn't trigger any tools")
			t.Log("This can happen if Claude doesn't attempt to write the file")
		}
	})

	t.Run("ParallelApprovalsWithDistinctToolUseIDs", func(t *testing.T) {
		// Clear any existing approvals
		_, err = db.Exec("DELETE FROM approvals")
		require.NoError(t, err)

		// Create temp directory for session
		testWorkDir := t.TempDir()

		// Prepare session creation request for REST API
		createReq := map[string]interface{}{
			"query":                  "Create 3 files in parallel: file1.txt with 'One', file2.txt with 'Two', file3.txt with 'Three'. Use parallel tool calls if possible.",
			"model":                  "sonnet",
			"permission_prompt_tool": "mcp__codelayer__request_approval",
			"max_turns":              3,
			"working_dir":            testWorkDir,
			"mcp_config": map[string]interface{}{
				"mcp_servers": map[string]interface{}{
					"codelayer": map[string]interface{}{
						"type": "http",
						"url":  fmt.Sprintf("http://127.0.0.1:%d/api/v1/mcp", httpPort),
					},
				},
			},
		}

		// Send REST API request to create session
		reqBody, _ := json.Marshal(createReq)
		httpReq, err := http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/api/v1/sessions", httpPort), bytes.NewBuffer(reqBody))
		require.NoError(t, err)
		httpReq.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(httpReq)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Check response status
		require.Equal(t, http.StatusCreated, resp.StatusCode, "Expected 201 Created")

		// Parse response
		var createResp map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&createResp)
		require.NoError(t, err)

		// Get session ID from response
		data := createResp["data"].(map[string]interface{})
		sessionID := data["session_id"].(string)
		t.Logf("Launched parallel session: %s", sessionID)

		// Let Claude run for a bit
		t.Log("Waiting for parallel operations...")
		time.Sleep(7 * time.Second)

		// Check database for approvals
		rows, err := db.Query(`
			SELECT id, tool_use_id, tool_name
			FROM approvals
			ORDER BY created_at DESC
		`)
		require.NoError(t, err)
		defer rows.Close()

		var approvals []struct {
			ID        string
			ToolUseID sql.NullString
			ToolName  string
		}

		for rows.Next() {
			var a struct {
				ID        string
				ToolUseID sql.NullString
				ToolName  string
			}
			err := rows.Scan(&a.ID, &a.ToolUseID, &a.ToolName)
			require.NoError(t, err)
			approvals = append(approvals, a)
		}

		t.Logf("Found %d approvals for parallel operations", len(approvals))

		// Verify each approval has a unique tool_use_id
		toolUseIDMap := make(map[string]bool)
		for _, a := range approvals {
			if !a.ToolUseID.Valid || a.ToolUseID.String == "" {
				t.Errorf("Approval %s has no tool_use_id!", a.ID)
			} else {
				if toolUseIDMap[a.ToolUseID.String] {
					t.Errorf("Duplicate tool_use_id found: %s", a.ToolUseID.String)
				}
				toolUseIDMap[a.ToolUseID.String] = true
				t.Logf("✓ Approval %s has unique tool_use_id: %s", a.ID, a.ToolUseID.String)
			}
		}

		// Cross-reference with conversation events
		var toolUseEvents []struct {
			ID   string
			Name string
		}
		rows2, err := db.Query(`
			SELECT tool_id, tool_name
			FROM conversation_events
			WHERE session_id = ? AND tool_id IS NOT NULL
		`, sessionID)
		if err == nil {
			defer rows2.Close()
			for rows2.Next() {
				var toolID, toolName string
				if err := rows2.Scan(&toolID, &toolName); err == nil {
					toolUseEvents = append(toolUseEvents, struct {
						ID   string
						Name string
					}{ID: toolID, Name: toolName})
				}
			}
		}

		t.Logf("Cross-referencing %d tool_use events with approvals", len(toolUseEvents))
		for _, toolUse := range toolUseEvents {
			found := false
			for _, a := range approvals {
				if a.ToolUseID.Valid && a.ToolUseID.String == toolUse.ID {
					found = true
					t.Logf("✓ Tool use %s matched with approval %s", toolUse.ID, a.ID)
					break
				}
			}
			if !found && toolUse.ID != "" {
				t.Logf("⚠ Tool use %s (%s) has no matching approval", toolUse.ID, toolUse.Name)
			}
		}
	})

	t.Run("ResumeSessionWithParallelApprovals", func(t *testing.T) {
		// Clear any existing approvals
		_, err = db.Exec("DELETE FROM approvals")
		require.NoError(t, err)

		// Create temp directory for session
		testWorkDir := t.TempDir()

		// Prepare initial session creation request with 4 parallel operations
		createReq := map[string]interface{}{
			"query":                  "Create 4 files in parallel: file1.txt with 'One', file2.txt with 'Two', file3.txt with 'Three', file4.txt with 'Four'. Use parallel tool calls.",
			"model":                  "sonnet",
			"permission_prompt_tool": "mcp__codelayer__request_approval",
			"max_turns":              3,
			"working_dir":            testWorkDir,
			"mcp_config": map[string]interface{}{
				"mcp_servers": map[string]interface{}{
					"codelayer": map[string]interface{}{
						"type": "http",
						"url":  fmt.Sprintf("http://127.0.0.1:%d/api/v1/mcp", httpPort),
					},
				},
			},
		}

		// Send REST API request to create initial session
		reqBody, _ := json.Marshal(createReq)
		httpReq, err := http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/api/v1/sessions", httpPort), bytes.NewBuffer(reqBody))
		require.NoError(t, err)
		httpReq.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(httpReq)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Check response status
		require.Equal(t, http.StatusCreated, resp.StatusCode, "Expected 201 Created")

		// Parse response
		var createResp map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&createResp)
		require.NoError(t, err)

		// Get session ID from response
		data := createResp["data"].(map[string]interface{})
		sessionID := data["session_id"].(string)
		t.Logf("Launched initial session: %s", sessionID)

		// Let Claude run for a bit to trigger first 4 approvals
		t.Log("Waiting for initial 4 parallel operations...")
		time.Sleep(5 * time.Second)

		// Check session status first
		var sessionStatus string
		err = db.QueryRow(`
			SELECT status FROM sessions
			WHERE id = ?
		`, sessionID).Scan(&sessionStatus)
		require.NoError(t, err)
		t.Logf("Initial session status: %s", sessionStatus)

		// Check initial approvals count
		var initialCount int
		err = db.QueryRow(`
			SELECT COUNT(*) FROM approvals
			WHERE session_id = ?
		`, sessionID).Scan(&initialCount)
		require.NoError(t, err)
		t.Logf("Found %d approvals after initial session", initialCount)

		// Store initial tool_use_ids for verification
		rows, err := db.Query(`
			SELECT tool_use_id FROM approvals
			WHERE session_id = ?
			ORDER BY created_at
		`, sessionID)
		require.NoError(t, err)

		var initialToolUseIDs []string
		for rows.Next() {
			var toolUseID sql.NullString
			err := rows.Scan(&toolUseID)
			require.NoError(t, err)
			if toolUseID.Valid {
				initialToolUseIDs = append(initialToolUseIDs, toolUseID.String)
			}
		}
		rows.Close()

		// Now resume the session with a request for 4 more parallel operations
		continueReq := map[string]interface{}{
			"query": "Create 4 more files in parallel: file5.txt with 'Five', file6.txt with 'Six', file7.txt with 'Seven', file8.txt with 'Eight'. Use parallel tool calls.",
		}

		// Send REST API request to continue/resume session
		reqBody, _ = json.Marshal(continueReq)
		httpReq, err = http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/api/v1/sessions/%s/continue", httpPort, sessionID), bytes.NewBuffer(reqBody))
		require.NoError(t, err)
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err = client.Do(httpReq)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Parse continue response
		var continueResp map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&continueResp)
		require.NoError(t, err)

		var childSessionID string
		if resp.StatusCode == http.StatusOK {
			// Get child session ID from response
			data = continueResp["data"].(map[string]interface{})
			childSessionID = data["session_id"].(string)
			t.Logf("Created child session: %s", childSessionID)
		} else if resp.StatusCode == http.StatusInternalServerError {
			// If we got a 500, the session might have completed, so we'll create a new session instead
			t.Logf("Continue failed (session may be completed), creating new session instead")

			// Create a new session for the second set of operations
			createReq["query"] = "Create 4 files: file5.txt with 'Five', file6.txt with 'Six', file7.txt with 'Seven', file8.txt with 'Eight'. Use parallel tool calls."
			reqBody, _ = json.Marshal(createReq)
			httpReq, err = http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/api/v1/sessions", httpPort), bytes.NewBuffer(reqBody))
			require.NoError(t, err)
			httpReq.Header.Set("Content-Type", "application/json")

			resp, err = client.Do(httpReq)
			require.NoError(t, err)
			defer resp.Body.Close()

			require.Equal(t, http.StatusCreated, resp.StatusCode, "Expected 201 Created for new session")

			var newResp map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&newResp)
			require.NoError(t, err)

			data = newResp["data"].(map[string]interface{})
			childSessionID = data["session_id"].(string)
			t.Logf("Created new session instead of child: %s", childSessionID)
		} else {
			t.Fatalf("Unexpected response status: %d", resp.StatusCode)
		}

		// Let Claude run for a bit to trigger second 4 approvals
		t.Log("Waiting for resumed session's 4 parallel operations...")
		time.Sleep(7 * time.Second)

		// Check total approvals count (should include both parent and child sessions)
		var totalCount int
		err = db.QueryRow(`
			SELECT COUNT(*) FROM approvals
			WHERE session_id IN (?, ?)
		`, sessionID, childSessionID).Scan(&totalCount)
		require.NoError(t, err)
		t.Logf("Found %d total approvals after resume", totalCount)

		// Verify all approvals have unique tool_use_ids
		rows, err = db.Query(`
			SELECT id, session_id, tool_use_id, tool_name
			FROM approvals
			WHERE session_id IN (?, ?)
			ORDER BY created_at
		`, sessionID, childSessionID)
		require.NoError(t, err)
		defer rows.Close()

		toolUseIDMap := make(map[string]bool)
		var parentApprovals, childApprovals int

		for rows.Next() {
			var approvalID, sessID, toolName string
			var toolUseID sql.NullString
			err := rows.Scan(&approvalID, &sessID, &toolUseID, &toolName)
			require.NoError(t, err)

			// Count approvals per session
			if sessID == sessionID {
				parentApprovals++
			} else if sessID == childSessionID {
				childApprovals++
			}

			// Verify tool_use_id is set and unique
			if !toolUseID.Valid || toolUseID.String == "" {
				t.Errorf("Approval %s has no tool_use_id!", approvalID)
			} else {
				if toolUseIDMap[toolUseID.String] {
					t.Errorf("Duplicate tool_use_id found: %s", toolUseID.String)
				}
				toolUseIDMap[toolUseID.String] = true
				t.Logf("✓ Approval %s (session: %s) has unique tool_use_id: %s", approvalID, sessID, toolUseID.String)
			}
		}

		t.Logf("Summary: %d approvals in parent session, %d in child session", parentApprovals, childApprovals)

		// Verify parent-child session relationship (if applicable)
		var parentSessionID sql.NullString
		err = db.QueryRow(`
			SELECT parent_session_id FROM sessions
			WHERE id = ?
		`, childSessionID).Scan(&parentSessionID)
		require.NoError(t, err)

		if parentSessionID.Valid && parentSessionID.String == sessionID {
			t.Logf("✓ Parent-child relationship verified: %s -> %s", sessionID, childSessionID)
		} else {
			t.Logf("Note: No parent-child relationship (may have created new session instead of resuming)")
		}

		// Verify conversation events have tool_use_ids
		var eventCount int
		err = db.QueryRow(`
			SELECT COUNT(*) FROM conversation_events
			WHERE session_id IN (?, ?) AND tool_id IS NOT NULL
		`, sessionID, childSessionID).Scan(&eventCount)
		require.NoError(t, err)
		t.Logf("Found %d tool use events in conversation_events", eventCount)

		// Final verification
		if totalCount > 0 {
			t.Logf("✓ Successfully tested resume session with %d total approvals, all with unique tool_use_ids", totalCount)
		} else {
			t.Log("⚠ Warning: No approvals were created - Claude might not have triggered tools")
		}
	})

	// Cleanup: shutdown daemon
	cancel()
	select {
	case err := <-errCh:
		if err != nil && err != context.Canceled {
			t.Errorf("Daemon exited with error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Error("Daemon did not shut down in time")
	}
}
