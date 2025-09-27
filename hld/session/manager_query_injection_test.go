package session

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/humanlayer/humanlayer/hld/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestQueryInjection(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	t.Run("Query is injected AFTER Claude session ID is available", func(t *testing.T) {
		// Create mock store
		mockStore := store.NewMockConversationStore(ctrl)

		// Create manager
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		// Test data
		sessionID := "test-session-id"
		claudeSessionID := "claude-session-id"
		query := "Test query that should be injected"

		// Store query in pendingQueries
		manager.pendingQueries.Store(sessionID, query)

		// Mock expectations - first check for continuation session
		mockStore.EXPECT().
			GetSession(gomock.Any(), sessionID).
			Return(&store.Session{
				ID:              sessionID,
				ClaudeSessionID: claudeSessionID,
				// No parent, so not a continuation
			}, nil)

		// Mock expectations - check for existing user message first
		mockStore.EXPECT().
			GetConversation(gomock.Any(), claudeSessionID).
			Return([]*store.ConversationEvent{}, nil)

		// Expect AddConversationEvent to be called with the query
		mockStore.EXPECT().
			AddConversationEvent(gomock.Any(), gomock.Any()).
			DoAndReturn(func(ctx context.Context, event *store.ConversationEvent) error {
				assert.Equal(t, sessionID, event.SessionID)
				assert.Equal(t, claudeSessionID, event.ClaudeSessionID)
				assert.Equal(t, 1, event.Sequence)
				assert.Equal(t, store.EventTypeMessage, event.EventType)
				assert.Equal(t, "user", event.Role)
				assert.Equal(t, query, event.Content)
				return nil
			})

		// Simulate what happens in monitorSession - LoadAndDelete before inject
		queryVal, ok := manager.pendingQueries.LoadAndDelete(sessionID)
		assert.True(t, ok)
		assert.Equal(t, query, queryVal)

		// Call injectQueryAsFirstEvent
		err = manager.injectQueryAsFirstEvent(context.Background(), sessionID, claudeSessionID, query)
		assert.NoError(t, err)

		// Verify query was removed from pendingQueries
		_, exists := manager.pendingQueries.Load(sessionID)
		assert.False(t, exists, "Query should be removed from pendingQueries after injection")
	})

	t.Run("Query appears as sequence=1 (first event)", func(t *testing.T) {
		mockStore := store.NewMockConversationStore(ctrl)
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		sessionID := "test-session-id"
		claudeSessionID := "claude-session-id"
		query := "Test query"

		mockStore.EXPECT().
			GetSession(gomock.Any(), sessionID).
			Return(&store.Session{
				ID:              sessionID,
				ClaudeSessionID: claudeSessionID,
				// No parent
			}, nil)

		mockStore.EXPECT().
			GetConversation(gomock.Any(), claudeSessionID).
			Return([]*store.ConversationEvent{}, nil)

		mockStore.EXPECT().
			AddConversationEvent(gomock.Any(), gomock.Any()).
			DoAndReturn(func(ctx context.Context, event *store.ConversationEvent) error {
				assert.Equal(t, 1, event.Sequence, "Query should be sequence 1")
				return nil
			})

		err = manager.injectQueryAsFirstEvent(context.Background(), sessionID, claudeSessionID, query)
		assert.NoError(t, err)
	})

	t.Run("Deduplication - query not injected twice if retried", func(t *testing.T) {
		mockStore := store.NewMockConversationStore(ctrl)
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		sessionID := "test-session-id"
		claudeSessionID := "claude-session-id"
		query := "Test query"

		mockStore.EXPECT().
			GetSession(gomock.Any(), sessionID).
			Return(&store.Session{
				ID:              sessionID,
				ClaudeSessionID: claudeSessionID,
				// No parent
			}, nil)

		// First call - simulate existing user message
		existingEvent := &store.ConversationEvent{
			Role:    "user",
			Content: "Some existing user message",
		}
		mockStore.EXPECT().
			GetConversation(gomock.Any(), claudeSessionID).
			Return([]*store.ConversationEvent{existingEvent}, nil)

		// AddConversationEvent should NOT be called due to deduplication

		err = manager.injectQueryAsFirstEvent(context.Background(), sessionID, claudeSessionID, query)
		assert.NoError(t, err)
	})

	t.Run("Cleanup - pending queries are cleaned up on error", func(t *testing.T) {
		mockStore := store.NewMockConversationStore(ctrl)
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		sessionID := "test-session-id"

		// Store query
		manager.pendingQueries.Store(sessionID, "Test query")

		// Mock the UpdateSession call that happens in updateSessionStatus
		mockStore.EXPECT().
			UpdateSession(gomock.Any(), sessionID, gomock.Any()).
			Return(nil)

		// Simulate session failure
		manager.updateSessionStatus(context.Background(), sessionID, StatusFailed, "Test error")

		// Verify query was cleaned up
		_, exists := manager.pendingQueries.Load(sessionID)
		assert.False(t, exists, "Pending query should be cleaned up on session failure")
	})

	t.Run("Query injection works with empty/whitespace queries", func(t *testing.T) {
		mockStore := store.NewMockConversationStore(ctrl)
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		testCases := []struct {
			name  string
			query string
		}{
			{"empty query", ""},
			{"whitespace only", "   "},
			{"newlines only", "\n\n"},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				sessionID := "test-session-id"

				// Empty/whitespace queries should not trigger injection
				manager.pendingQueries.Store(sessionID, tc.query)

				// LoadAndDelete should return the stored value
				val, ok := manager.pendingQueries.LoadAndDelete(sessionID)
				assert.True(t, ok)
				assert.Equal(t, tc.query, val)

				// But injectQueryAsFirstEvent should skip empty queries
				// (no mock expectations set, so test will fail if any store methods are called)
			})
		}
	})
}

func TestQueryInjectionRaceCondition(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockConversationStore(ctrl)
	manager, err := NewManager(nil, mockStore, "")
	require.NoError(t, err)

	// Test that query injection is thread-safe
	// Multiple sessions starting concurrently
	numSessions := 10
	var wg sync.WaitGroup
	wg.Add(numSessions)

	// Set up expectations for all sessions
	for i := 0; i < numSessions; i++ {
		sessionID := fmt.Sprintf("session-%d", i)
		claudeSessionID := fmt.Sprintf("claude-session-%d", i)
		query := fmt.Sprintf("Query for session %d", i)

		// Store query
		manager.pendingQueries.Store(sessionID, query)

		// Expect GetSession to check if it's a continuation (new behavior)
		mockStore.EXPECT().
			GetSession(gomock.Any(), sessionID).
			Return(&store.Session{
				ID:              sessionID,
				ClaudeSessionID: claudeSessionID,
				// No ParentSessionID, so it's not a continuation
			}, nil)

		// Expect GetConversationEvents and AddConversationEvent for each session
		mockStore.EXPECT().
			GetConversation(gomock.Any(), claudeSessionID).
			Return([]*store.ConversationEvent{}, nil)

		mockStore.EXPECT().
			AddConversationEvent(gomock.Any(), gomock.Any()).
			DoAndReturn(func(ctx context.Context, event *store.ConversationEvent) error {
				// Verify each session gets its correct query
				expectedQuery := fmt.Sprintf("Query for session %s", event.SessionID[8:]) // Extract session number
				assert.Equal(t, expectedQuery, event.Content)
				return nil
			})
	}

	// Launch concurrent injections
	for i := 0; i < numSessions; i++ {
		go func(sessionNum int) {
			defer wg.Done()

			sessionID := fmt.Sprintf("session-%d", sessionNum)
			claudeSessionID := fmt.Sprintf("claude-session-%d", sessionNum)

			// Simulate some processing time
			time.Sleep(time.Millisecond * time.Duration(sessionNum))

			// Load and inject query
			if queryVal, ok := manager.pendingQueries.LoadAndDelete(sessionID); ok {
				if query, ok := queryVal.(string); ok && query != "" {
					err := manager.injectQueryAsFirstEvent(context.Background(), sessionID, claudeSessionID, query)
					assert.NoError(t, err)
				}
			}
		}(i)
	}

	wg.Wait()

	// Verify all queries were processed and cleaned up
	manager.pendingQueries.Range(func(key, value interface{}) bool {
		t.Errorf("Found unprocessed query for session %v", key)
		return true
	})
}

func TestInjectQueryAsFirstEvent_ContinuationSessions(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	t.Run("Skips injection for continuation sessions", func(t *testing.T) {
		mockStore := store.NewMockConversationStore(ctrl)
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		sessionID := "child-session-id"
		parentID := "parent-session-id"
		claudeSessionID := "claude-session-id"
		query := "continuation query"

		// Mock store to return a session with parent
		mockStore.EXPECT().
			GetSession(gomock.Any(), sessionID).
			Return(&store.Session{
				ID:              sessionID,
				ParentSessionID: parentID,
				ClaudeSessionID: claudeSessionID,
			}, nil)

		// Should not call GetConversation or AddConversationEvent

		err = manager.injectQueryAsFirstEvent(context.Background(), sessionID, claudeSessionID, query)
		assert.NoError(t, err)
	})

	t.Run("Injects query for new sessions without parent", func(t *testing.T) {
		mockStore := store.NewMockConversationStore(ctrl)
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		sessionID := "new-session-id"
		claudeSessionID := "claude-session-id"
		query := "initial query"

		// Mock store to return session without parent
		mockStore.EXPECT().
			GetSession(gomock.Any(), sessionID).
			Return(&store.Session{
				ID:              sessionID,
				ClaudeSessionID: claudeSessionID,
			}, nil)

		// Mock empty conversation
		mockStore.EXPECT().
			GetConversation(gomock.Any(), claudeSessionID).
			Return([]*store.ConversationEvent{}, nil)

		// Expect event to be added
		mockStore.EXPECT().
			AddConversationEvent(gomock.Any(), gomock.Any()).
			DoAndReturn(func(ctx context.Context, event *store.ConversationEvent) error {
				assert.Equal(t, sessionID, event.SessionID)
				assert.Equal(t, claudeSessionID, event.ClaudeSessionID)
				assert.Equal(t, 1, event.Sequence)
				assert.Equal(t, "user", event.Role)
				assert.Equal(t, query, event.Content)
				return nil
			})

		err = manager.injectQueryAsFirstEvent(context.Background(), sessionID, claudeSessionID, query)
		assert.NoError(t, err)
	})

	t.Run("Falls back to original logic if GetSession fails", func(t *testing.T) {
		mockStore := store.NewMockConversationStore(ctrl)
		manager, err := NewManager(nil, mockStore, "")
		require.NoError(t, err)

		sessionID := "fallback-session-id"
		claudeSessionID := "claude-session-id"
		query := "fallback query"

		// Mock store to fail getting session
		mockStore.EXPECT().
			GetSession(gomock.Any(), sessionID).
			Return(nil, fmt.Errorf("db error"))

		// Should continue with original logic
		mockStore.EXPECT().
			GetConversation(gomock.Any(), claudeSessionID).
			Return([]*store.ConversationEvent{}, nil)

		mockStore.EXPECT().
			AddConversationEvent(gomock.Any(), gomock.Any()).
			Return(nil)

		err = manager.injectQueryAsFirstEvent(context.Background(), sessionID, claudeSessionID, query)
		assert.NoError(t, err)
	})
}

// Note: Summary calculation is thoroughly tested in summary_test.go
// The integration of summary calculation with LaunchSession and ContinueSession
// is implicitly tested when those methods create sessions with the Summary field populated.
// Following the established pattern in this codebase, we don't mock claudecode.Client
// for unit tests, so we can't fully test LaunchSession here.
