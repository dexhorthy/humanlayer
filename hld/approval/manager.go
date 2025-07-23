package approval

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/humanlayer/humanlayer/hld/bus"
	"github.com/humanlayer/humanlayer/hld/store"
)

// manager manages approvals locally without HumanLayer API
type manager struct {
	store    store.ConversationStore
	eventBus bus.EventBus
}

// NewManager creates a new local approval manager
func NewManager(store store.ConversationStore, eventBus bus.EventBus) Manager {
	return &manager{
		store:    store,
		eventBus: eventBus,
	}
}

// CreateApproval creates a new local approval
func (m *manager) CreateApproval(ctx context.Context, runID, toolName string, toolInput json.RawMessage) (string, error) {
	// Look up session by run_id
	session, err := m.store.GetSessionByRunID(ctx, runID)
	if err != nil {
		return "", fmt.Errorf("failed to get session by run_id: %w", err)
	}
	if session == nil {
		return "", fmt.Errorf("session not found for run_id: %s", runID)
	}

	// Check if this is an edit tool and auto-accept is enabled
	status := store.ApprovalStatusLocalPending
	comment := ""
	if session.AutoAcceptEdits && isEditTool(toolName) {
		status = store.ApprovalStatusLocalApproved
		comment = "Auto-accepted (auto-accept mode enabled)"
	}

	// Create approval
	approval := &store.Approval{
		ID:        "local-" + uuid.New().String(),
		RunID:     runID,
		SessionID: session.ID,
		Status:    status,
		CreatedAt: time.Now(),
		ToolName:  toolName,
		ToolInput: toolInput,
		Comment:   comment,
	}

	// Store it
	if err := m.store.CreateApproval(ctx, approval); err != nil {
		return "", fmt.Errorf("failed to store approval: %w", err)
	}

	// Try to correlate with the most recent uncorrelated tool call
	if err := m.correlateApproval(ctx, approval); err != nil {
		// Log but don't fail - correlation is best effort
		slog.Warn("failed to correlate approval with tool call",
			"error", err,
			"approval_id", approval.ID,
			"session_id", session.ID)
	}

	// Publish event for real-time updates
	m.publishNewApprovalEvent(approval)

	// Handle status-specific post-creation tasks
	switch status {
	case store.ApprovalStatusLocalPending:
		// Update session status to waiting_input for pending approvals
		// This ensures the UI can display the approval interface
		if err := m.updateSessionStatus(ctx, session.ID, store.SessionStatusWaitingInput); err != nil {
			slog.Warn("failed to update session status",
				"error", err,
				"session_id", session.ID)
		}
	case store.ApprovalStatusLocalApproved:
		// For auto-approved, update correlation status immediately
		if err := m.store.UpdateApprovalStatus(ctx, approval.ID, store.ApprovalStatusApproved); err != nil {
			slog.Warn("failed to update approval status in conversation events",
				"error", err,
				"approval_id", approval.ID)
		}
		// Publish resolved event for auto-approved
		m.publishApprovalResolvedEvent(approval, true, comment)
	}

	logLevel := slog.LevelInfo
	if status == store.ApprovalStatusLocalApproved {
		logLevel = slog.LevelDebug // Less noise for auto-approved
	}
	slog.Log(ctx, logLevel, "created local approval",
		"approval_id", approval.ID,
		"session_id", session.ID,
		"tool_name", toolName,
		"status", status,
		"auto_accepted", status == store.ApprovalStatusLocalApproved)

	return approval.ID, nil
}

// GetPendingApprovals retrieves pending approvals for a session
func (m *manager) GetPendingApprovals(ctx context.Context, sessionID string) ([]*store.Approval, error) {
	approvals, err := m.store.GetPendingApprovals(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get pending approvals: %w", err)
	}
	return approvals, nil
}

// GetApproval retrieves a specific approval by ID
func (m *manager) GetApproval(ctx context.Context, id string) (*store.Approval, error) {
	approval, err := m.store.GetApproval(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get approval: %w", err)
	}
	return approval, nil
}

// ApproveToolCall approves a tool call
func (m *manager) ApproveToolCall(ctx context.Context, id string, comment string) error {
	// Get the approval first
	approval, err := m.store.GetApproval(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get approval: %w", err)
	}

	// Update approval status
	if err := m.store.UpdateApprovalResponse(ctx, id, store.ApprovalStatusLocalApproved, comment); err != nil {
		return fmt.Errorf("failed to update approval: %w", err)
	}

	// Update correlation status in conversation events
	if err := m.store.UpdateApprovalStatus(ctx, id, store.ApprovalStatusApproved); err != nil {
		slog.Warn("failed to update approval status in conversation events",
			"error", err,
			"approval_id", id)
	}

	// Publish event
	m.publishApprovalResolvedEvent(approval, true, comment)

	// Check if there are other pending approvals
	pendingApprovals, err := m.GetPendingApprovals(ctx, approval.SessionID)
	if err != nil {
		slog.Warn("failed to check pending approvals",
			"error", err,
			"session_id", approval.SessionID)
		// Continue with status update even if check fails
		pendingApprovals = nil
	}

	// Only transition to running if no other approvals are pending
	// GetPendingApprovals returns ALL pending approvals, including ones that haven't
	// been updated in the database yet. We need to check if there are any OTHER
	// pending approvals besides the one we just approved.
	otherPendingCount := 0
	for _, pa := range pendingApprovals {
		if pa.ID != id {
			otherPendingCount++
		}
	}

	if otherPendingCount == 0 {
		if err := m.updateSessionStatus(ctx, approval.SessionID, store.SessionStatusRunning); err != nil {
			slog.Warn("failed to update session status",
				"error", err,
				"session_id", approval.SessionID)
		}
		slog.Debug("transitioning to running - no other pending approvals",
			"session_id", approval.SessionID,
			"approval_id", id)
	} else {
		slog.Debug("keeping session in waiting_input status",
			"session_id", approval.SessionID,
			"approval_id", id,
			"other_pending_approvals", otherPendingCount)
	}

	slog.Info("approved tool call",
		"approval_id", id,
		"comment", comment,
		"remaining_approvals", func() int {
			if pendingApprovals == nil {
				return -1
			}
			return len(pendingApprovals) - 1
		}())

	return nil
}

// DenyToolCall denies a tool call
func (m *manager) DenyToolCall(ctx context.Context, id string, reason string) error {
	// Get the approval first
	approval, err := m.store.GetApproval(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get approval: %w", err)
	}

	// Update approval status
	if err := m.store.UpdateApprovalResponse(ctx, id, store.ApprovalStatusLocalDenied, reason); err != nil {
		return fmt.Errorf("failed to update approval: %w", err)
	}

	// Update correlation status in conversation events
	if err := m.store.UpdateApprovalStatus(ctx, id, store.ApprovalStatusDenied); err != nil {
		slog.Warn("failed to update approval status in conversation events",
			"error", err,
			"approval_id", id)
	}

	// Publish event
	m.publishApprovalResolvedEvent(approval, false, reason)

	// Check if there are other pending approvals
	pendingApprovals, err := m.GetPendingApprovals(ctx, approval.SessionID)
	if err != nil {
		slog.Warn("failed to check pending approvals",
			"error", err,
			"session_id", approval.SessionID)
		// Continue with status update even if check fails
		pendingApprovals = nil
	}

	// Only transition to running if no other approvals are pending
	// GetPendingApprovals returns ALL pending approvals, including ones that haven't
	// been updated in the database yet. We need to check if there are any OTHER
	// pending approvals besides the one we just approved.
	otherPendingCount := 0
	for _, pa := range pendingApprovals {
		if pa.ID != id {
			otherPendingCount++
		}
	}

	if otherPendingCount == 0 {
		if err := m.updateSessionStatus(ctx, approval.SessionID, store.SessionStatusRunning); err != nil {
			slog.Warn("failed to update session status",
				"error", err,
				"session_id", approval.SessionID)
		}
		slog.Debug("transitioning to running - no other pending approvals",
			"session_id", approval.SessionID,
			"approval_id", id)
	} else {
		slog.Debug("keeping session in waiting_input status",
			"session_id", approval.SessionID,
			"approval_id", id,
			"other_pending_approvals", otherPendingCount)
	}

	slog.Info("denied tool call",
		"approval_id", id,
		"reason", reason,
		"remaining_approvals", func() int {
			if pendingApprovals == nil {
				return -1
			}
			return len(pendingApprovals) - 1
		}())

	return nil
}

// correlateApproval tries to correlate an approval with a tool call
func (m *manager) correlateApproval(ctx context.Context, approval *store.Approval) error {
	// Find the most recent uncorrelated pending tool call
	toolCall, err := m.store.GetUncorrelatedPendingToolCall(ctx, approval.SessionID, approval.ToolName)
	if err != nil {
		return fmt.Errorf("failed to find pending tool call: %w", err)
	}
	if toolCall == nil {
		return fmt.Errorf("no matching tool call found")
	}

	// Correlate by tool ID
	if err := m.store.CorrelateApprovalByToolID(ctx, approval.SessionID, toolCall.ToolID, approval.ID); err != nil {
		return fmt.Errorf("failed to correlate approval: %w", err)
	}

	return nil
}

// publishNewApprovalEvent publishes an event when a new approval is created
func (m *manager) publishNewApprovalEvent(approval *store.Approval) {
	if m.eventBus != nil {
		event := bus.Event{
			Type:      bus.EventNewApproval,
			Timestamp: time.Now(),
			Data: map[string]interface{}{
				"approval_id": approval.ID,
				"session_id":  approval.SessionID,
				"tool_name":   approval.ToolName,
			},
		}
		m.eventBus.Publish(event)
	}
}

// publishApprovalResolvedEvent publishes an event when an approval is resolved
func (m *manager) publishApprovalResolvedEvent(approval *store.Approval, approved bool, responseText string) {
	if m.eventBus != nil {
		event := bus.Event{
			Type:      bus.EventApprovalResolved,
			Timestamp: time.Now(),
			Data: map[string]interface{}{
				"approval_id":   approval.ID,
				"session_id":    approval.SessionID,
				"approved":      approved,
				"response_text": responseText,
			},
		}
		m.eventBus.Publish(event)
	}
}

// updateSessionStatus updates the session status and emits status change event
func (m *manager) updateSessionStatus(ctx context.Context, sessionID, status string) error {
	// Get current status for the event
	session, err := m.store.GetSession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("failed to get session: %w", err)
	}
	oldStatus := session.Status

	// Update database
	updates := store.SessionUpdate{
		Status:         &status,
		LastActivityAt: &[]time.Time{time.Now()}[0],
	}
	if err := m.store.UpdateSession(ctx, sessionID, updates); err != nil {
		return err
	}

	// Emit event for UI updates (only if status actually changed)
	if m.eventBus != nil && oldStatus != status {
		event := bus.Event{
			Type:      bus.EventSessionStatusChanged,
			Timestamp: time.Now(),
			Data: map[string]interface{}{
				"session_id": sessionID,
				"old_status": oldStatus,
				"new_status": status,
			},
		}
		m.eventBus.Publish(event)

		slog.Debug("published session status change event",
			"session_id", sessionID,
			"old_status", oldStatus,
			"new_status", status)
	}

	return nil
}

// isEditTool checks if a tool name is one of the edit tools
func isEditTool(toolName string) bool {
	return toolName == "Edit" || toolName == "Write" || toolName == "MultiEdit"
}
