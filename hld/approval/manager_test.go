package approval

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/humanlayer/humanlayer/hld/bus"
	"github.com/humanlayer/humanlayer/hld/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestManager_CreateApproval(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus)

	ctx := context.Background()
	runID := "test-run-123"
	sessionID := "test-session-456"
	toolName := "Write"
	toolInput := json.RawMessage(`{"file": "test.txt", "content": "hello"}`)

	// Mock getting session by run ID
	mockStore.EXPECT().GetSessionByRunID(ctx, runID).Return(&store.Session{
		ID:    sessionID,
		RunID: runID,
	}, nil)

	// Mock creating approval
	mockStore.EXPECT().CreateApproval(ctx, gomock.Any()).DoAndReturn(func(ctx context.Context, approval *store.Approval) error {
		assert.Equal(t, runID, approval.RunID)
		assert.Equal(t, sessionID, approval.SessionID)
		assert.Equal(t, store.ApprovalStatusLocalPending, approval.Status)
		assert.Equal(t, toolName, approval.ToolName)
		assert.Equal(t, toolInput, approval.ToolInput)
		assert.NotEmpty(t, approval.ID)
		assert.True(t, strings.HasPrefix(approval.ID, "local-"))
		return nil
	})

	// Mock correlation attempt - it's ok if it fails
	mockStore.EXPECT().GetUncorrelatedPendingToolCall(ctx, sessionID, toolName).Return(nil, nil)

	// Mock event publishing
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		assert.Equal(t, bus.EventNewApproval, event.Type)
		assert.Equal(t, sessionID, event.Data["session_id"])
		assert.Equal(t, toolName, event.Data["tool_name"])
	})

	// Mock getting session for status change event
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusRunning,
	}, nil)

	// Mock session status update
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)

	// Mock event publishing for status change
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		assert.Equal(t, bus.EventSessionStatusChanged, event.Type)
		assert.Equal(t, sessionID, event.Data["session_id"])
		assert.Equal(t, store.SessionStatusRunning, event.Data["old_status"])
		assert.Equal(t, store.SessionStatusWaitingInput, event.Data["new_status"])
	})

	// Create approval
	approvalID, err := manager.CreateApproval(ctx, runID, toolName, toolInput)
	require.NoError(t, err)
	assert.NotEmpty(t, approvalID)
	assert.True(t, strings.HasPrefix(approvalID, "local-"))
}

func TestManager_CreateApproval_SessionNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus)

	ctx := context.Background()
	runID := "test-run-123"
	toolName := "Write"
	toolInput := json.RawMessage(`{"file": "test.txt"}`)

	// Mock getting session by run ID - returns nil
	mockStore.EXPECT().GetSessionByRunID(ctx, runID).Return(nil, nil)

	// Create approval should fail
	_, err := manager.CreateApproval(ctx, runID, toolName, toolInput)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "session not found")
}

func TestManager_GetPendingApprovals(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus)

	ctx := context.Background()
	sessionID := "test-session-456"

	expectedApprovals := []*store.Approval{
		{
			ID:        "local-approval-1",
			SessionID: sessionID,
			Status:    store.ApprovalStatusLocalPending,
			ToolName:  "Write",
		},
		{
			ID:        "local-approval-2",
			SessionID: sessionID,
			Status:    store.ApprovalStatusLocalPending,
			ToolName:  "Execute",
		},
	}

	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return(expectedApprovals, nil)

	approvals, err := manager.GetPendingApprovals(ctx, sessionID)
	require.NoError(t, err)
	assert.Equal(t, expectedApprovals, approvals)
}

func TestManager_ApproveToolCall(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus)

	ctx := context.Background()
	approvalID := "local-approval-123"
	sessionID := "test-session-456"
	comment := "Looks good!"

	approval := &store.Approval{
		ID:        approvalID,
		SessionID: sessionID,
		Status:    store.ApprovalStatusLocalPending,
		ToolName:  "Write",
	}

	// Mock getting approval
	mockStore.EXPECT().GetApproval(ctx, approvalID).Return(approval, nil)

	// Mock updating approval response
	mockStore.EXPECT().UpdateApprovalResponse(ctx, approvalID, store.ApprovalStatusLocalApproved, comment).Return(nil)

	// Mock updating approval status in conversation events
	mockStore.EXPECT().UpdateApprovalStatus(ctx, approvalID, store.ApprovalStatusApproved).Return(nil)

	// Mock event publishing
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		assert.Equal(t, bus.EventApprovalResolved, event.Type)
		assert.Equal(t, approvalID, event.Data["approval_id"])
		assert.Equal(t, sessionID, event.Data["session_id"])
		assert.Equal(t, true, event.Data["approved"])
		assert.Equal(t, comment, event.Data["response_text"])
	})

	// Mock getting session for status change event
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusWaitingInput,
	}, nil)

	// Mock session status update
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)

	// Mock event publishing for status change
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		assert.Equal(t, bus.EventSessionStatusChanged, event.Type)
		assert.Equal(t, sessionID, event.Data["session_id"])
		assert.Equal(t, store.SessionStatusWaitingInput, event.Data["old_status"])
		assert.Equal(t, store.SessionStatusRunning, event.Data["new_status"])
	})

	// Mock no other pending approvals
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return([]*store.Approval{approval}, nil)

	err := manager.ApproveToolCall(ctx, approvalID, comment)
	require.NoError(t, err)
}

func TestManager_DenyToolCall(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus)

	ctx := context.Background()
	approvalID := "local-approval-123"
	sessionID := "test-session-456"
	reason := "Not safe to execute"

	approval := &store.Approval{
		ID:        approvalID,
		SessionID: sessionID,
		Status:    store.ApprovalStatusLocalPending,
		ToolName:  "Execute",
	}

	// Mock getting approval
	mockStore.EXPECT().GetApproval(ctx, approvalID).Return(approval, nil)

	// Mock updating approval response
	mockStore.EXPECT().UpdateApprovalResponse(ctx, approvalID, store.ApprovalStatusLocalDenied, reason).Return(nil)

	// Mock updating approval status in conversation events
	mockStore.EXPECT().UpdateApprovalStatus(ctx, approvalID, store.ApprovalStatusDenied).Return(nil)

	// Mock event publishing
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		assert.Equal(t, bus.EventApprovalResolved, event.Type)
		assert.Equal(t, approvalID, event.Data["approval_id"])
		assert.Equal(t, sessionID, event.Data["session_id"])
		assert.Equal(t, false, event.Data["approved"])
		assert.Equal(t, reason, event.Data["response_text"])
	})

	// Mock getting session for status change event
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusWaitingInput,
	}, nil)

	// Mock session status update
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)

	// Mock event publishing for status change
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		assert.Equal(t, bus.EventSessionStatusChanged, event.Type)
		assert.Equal(t, sessionID, event.Data["session_id"])
		assert.Equal(t, store.SessionStatusWaitingInput, event.Data["old_status"])
		assert.Equal(t, store.SessionStatusRunning, event.Data["new_status"])
	})

	// Mock no other pending approvals
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return([]*store.Approval{approval}, nil)

	err := manager.DenyToolCall(ctx, approvalID, reason)
	require.NoError(t, err)
}

func TestManager_CorrelateApproval(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus)

	ctx := context.Background()
	runID := "test-run-123"
	sessionID := "test-session-456"
	toolName := "Write"
	toolInput := json.RawMessage(`{"file": "test.txt"}`)

	// Mock getting session by run ID
	mockStore.EXPECT().GetSessionByRunID(ctx, runID).Return(&store.Session{
		ID:    sessionID,
		RunID: runID,
	}, nil)

	// Mock creating approval
	mockStore.EXPECT().CreateApproval(ctx, gomock.Any()).Return(nil)

	// Mock successful correlation
	pendingToolCall := &store.ConversationEvent{
		ID:       123,
		ToolID:   "tool-123",
		ToolName: toolName,
	}
	mockStore.EXPECT().GetUncorrelatedPendingToolCall(ctx, sessionID, toolName).Return(pendingToolCall, nil)

	// Mock correlating by tool ID
	mockStore.EXPECT().CorrelateApprovalByToolID(ctx, sessionID, "tool-123", gomock.Any()).Return(nil)

	// Mock event publishing
	mockEventBus.EXPECT().Publish(gomock.Any())

	// Mock getting session for status change event
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusRunning,
	}, nil)

	// Mock session status update
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)

	// Mock event publishing for status change
	mockEventBus.EXPECT().Publish(gomock.Any())

	// Create approval (which will attempt correlation)
	approvalID, err := manager.CreateApproval(ctx, runID, toolName, toolInput)
	require.NoError(t, err)
	assert.NotEmpty(t, approvalID)
}

func TestApprovalManager_EmitsStatusChangeEvent(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus).(*manager)

	ctx := context.Background()
	sessionID := "test-session-123"
	approvalID := "local-approval-789"

	// Create mock approval
	approval := &store.Approval{
		ID:        approvalID,
		SessionID: sessionID,
		Status:    store.ApprovalStatusLocalPending,
		ToolName:  "Write",
	}

	// Setup mocks for ApproveToolCall flow
	mockStore.EXPECT().GetApproval(ctx, approvalID).Return(approval, nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, approvalID, store.ApprovalStatusLocalApproved, "approved").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, approvalID, store.ApprovalStatusApproved).Return(nil)

	// Mock session in waiting_input status
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusWaitingInput,
	}, nil)

	// Mock successful status update
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)

	// Capture published events
	var publishedEvents []bus.Event
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		publishedEvents = append(publishedEvents, event)
	}).Times(2) // Expect exactly 2 events: approval resolved and status change

	// Mock no other pending approvals
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return([]*store.Approval{approval}, nil)

	// Test: Approve tool call
	err := manager.ApproveToolCall(ctx, approvalID, "approved")
	require.NoError(t, err)

	// Verify: Both events were published
	require.Len(t, publishedEvents, 2)

	// Find status change event
	var statusEvent *bus.Event
	for _, e := range publishedEvents {
		if e.Type == bus.EventSessionStatusChanged {
			statusEvent = &e
			break
		}
	}

	require.NotNil(t, statusEvent, "Expected status change event to be published")
	require.Equal(t, sessionID, statusEvent.Data["session_id"])
	require.Equal(t, store.SessionStatusWaitingInput, statusEvent.Data["old_status"])
	require.Equal(t, store.SessionStatusRunning, statusEvent.Data["new_status"])
}

func TestApprovalManager_ParallelApprovals(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus).(*manager)

	ctx := context.Background()
	sessionID := "test-session-123"
	approval1ID := "local-approval-001"
	approval2ID := "local-approval-002"

	// Create mock approvals
	approval1 := &store.Approval{
		ID:        approval1ID,
		SessionID: sessionID,
		Status:    store.ApprovalStatusLocalPending,
		ToolName:  "Write",
	}
	approval2 := &store.Approval{
		ID:        approval2ID,
		SessionID: sessionID,
		Status:    store.ApprovalStatusLocalPending,
		ToolName:  "Execute",
	}

	// Test Case 1: Approve first approval with another pending
	// Setup mocks for first approval
	mockStore.EXPECT().GetApproval(ctx, approval1ID).Return(approval1, nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, approval1ID, store.ApprovalStatusLocalApproved, "approved first").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, approval1ID, store.ApprovalStatusApproved).Return(nil)

	// Mock that there are still 2 pending approvals (including current one being processed)
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return([]*store.Approval{approval1, approval2}, nil)

	// Event should be published but NO status update should happen
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		assert.Equal(t, bus.EventApprovalResolved, event.Type)
	})

	// Approve first tool - should NOT transition to running
	err := manager.ApproveToolCall(ctx, approval1ID, "approved first")
	require.NoError(t, err)

	// Test Case 2: Approve second approval (last one)
	// Setup mocks for second approval
	mockStore.EXPECT().GetApproval(ctx, approval2ID).Return(approval2, nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, approval2ID, store.ApprovalStatusLocalApproved, "approved second").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, approval2ID, store.ApprovalStatusApproved).Return(nil)

	// Mock that there's only 1 pending approval left (the current one)
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return([]*store.Approval{approval2}, nil)

	// Mock session in waiting_input status
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusWaitingInput,
	}, nil)

	// NOW we expect status update
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)

	// Expect both approval resolved and status change events
	var publishedEvents []bus.Event
	mockEventBus.EXPECT().Publish(gomock.Any()).Do(func(event bus.Event) {
		publishedEvents = append(publishedEvents, event)
	}).Times(2)

	// Approve second tool - should transition to running
	err = manager.ApproveToolCall(ctx, approval2ID, "approved second")
	require.NoError(t, err)

	// Verify status change event was published
	var statusEvent *bus.Event
	for _, e := range publishedEvents {
		if e.Type == bus.EventSessionStatusChanged {
			statusEvent = &e
			break
		}
	}
	require.NotNil(t, statusEvent, "Expected status change event when approving last tool")
}

func TestApprovalManager_ThreeParallelApprovals(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus).(*manager)

	ctx := context.Background()
	sessionID := "test-session-456"
	approvals := []*store.Approval{
		{ID: "local-001", SessionID: sessionID, Status: store.ApprovalStatusLocalPending, ToolName: "Write"},
		{ID: "local-002", SessionID: sessionID, Status: store.ApprovalStatusLocalPending, ToolName: "Edit"},
		{ID: "local-003", SessionID: sessionID, Status: store.ApprovalStatusLocalPending, ToolName: "Execute"},
	}

	// Approve first tool - 3 pending
	mockStore.EXPECT().GetApproval(ctx, "local-001").Return(approvals[0], nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, "local-001", store.ApprovalStatusLocalApproved, "").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, "local-001", store.ApprovalStatusApproved).Return(nil)
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return(approvals, nil)
	mockEventBus.EXPECT().Publish(gomock.Any())

	err := manager.ApproveToolCall(ctx, "local-001", "")
	require.NoError(t, err)

	// Deny second tool - 2 pending
	mockStore.EXPECT().GetApproval(ctx, "local-002").Return(approvals[1], nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, "local-002", store.ApprovalStatusLocalDenied, "not safe").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, "local-002", store.ApprovalStatusDenied).Return(nil)
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return(approvals[1:], nil) // Only 2 and 3 pending
	mockEventBus.EXPECT().Publish(gomock.Any())

	err = manager.DenyToolCall(ctx, "local-002", "not safe")
	require.NoError(t, err)

	// Approve third tool - last one
	mockStore.EXPECT().GetApproval(ctx, "local-003").Return(approvals[2], nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, "local-003", store.ApprovalStatusLocalApproved, "").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, "local-003", store.ApprovalStatusApproved).Return(nil)
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return(approvals[2:], nil) // Only 3 pending
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusWaitingInput,
	}, nil)
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)
	mockEventBus.EXPECT().Publish(gomock.Any()).Times(2) // approval resolved + status change

	err = manager.ApproveToolCall(ctx, "local-003", "")
	require.NoError(t, err)
}

func TestApprovalManager_ErrorHandlingInParallelApprovals(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus).(*manager)

	ctx := context.Background()
	sessionID := "test-session-789"
	approvalID := "local-approval-123"

	approval := &store.Approval{
		ID:        approvalID,
		SessionID: sessionID,
		Status:    store.ApprovalStatusLocalPending,
		ToolName:  "Write",
	}

	// Setup mocks
	mockStore.EXPECT().GetApproval(ctx, approvalID).Return(approval, nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, approvalID, store.ApprovalStatusLocalApproved, "").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, approvalID, store.ApprovalStatusApproved).Return(nil)

	// Mock error when checking pending approvals - should still update status
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return(nil, fmt.Errorf("database error"))
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusWaitingInput,
	}, nil)
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)
	mockEventBus.EXPECT().Publish(gomock.Any()).Times(2)

	// Should not fail even if GetPendingApprovals fails
	err := manager.ApproveToolCall(ctx, approvalID, "")
	require.NoError(t, err)
}

func TestApprovalManager_MixedApprovalAndDenial(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	mockEventBus := bus.NewMockEventBus(ctrl)

	manager := NewManager(mockStore, mockEventBus).(*manager)

	ctx := context.Background()
	sessionID := "test-session-mix"

	approvals := []*store.Approval{
		{ID: "local-mix-001", SessionID: sessionID, Status: store.ApprovalStatusLocalPending, ToolName: "Write"},
		{ID: "local-mix-002", SessionID: sessionID, Status: store.ApprovalStatusLocalPending, ToolName: "Execute"},
	}

	// Deny first approval - should still have one pending
	mockStore.EXPECT().GetApproval(ctx, "local-mix-001").Return(approvals[0], nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, "local-mix-001", store.ApprovalStatusLocalDenied, "dangerous").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, "local-mix-001", store.ApprovalStatusDenied).Return(nil)
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return(approvals, nil)
	mockEventBus.EXPECT().Publish(gomock.Any())

	err := manager.DenyToolCall(ctx, "local-mix-001", "dangerous")
	require.NoError(t, err)

	// Approve second approval - should transition to running
	mockStore.EXPECT().GetApproval(ctx, "local-mix-002").Return(approvals[1], nil)
	mockStore.EXPECT().UpdateApprovalResponse(ctx, "local-mix-002", store.ApprovalStatusLocalApproved, "safe").Return(nil)
	mockStore.EXPECT().UpdateApprovalStatus(ctx, "local-mix-002", store.ApprovalStatusApproved).Return(nil)
	mockStore.EXPECT().GetPendingApprovals(ctx, sessionID).Return(approvals[1:], nil)
	mockStore.EXPECT().GetSession(ctx, sessionID).Return(&store.Session{
		ID:     sessionID,
		Status: store.SessionStatusWaitingInput,
	}, nil)
	mockStore.EXPECT().UpdateSession(ctx, sessionID, gomock.Any()).Return(nil)
	mockEventBus.EXPECT().Publish(gomock.Any()).Times(2)

	err = manager.ApproveToolCall(ctx, "local-mix-002", "safe")
	require.NoError(t, err)
}
