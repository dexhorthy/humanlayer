# HumanLayer Daemon (HLD) Specification Plan

This document tracks the development of comprehensive black-box specifications for the HumanLayer Daemon (HLD). These specifications define the external contracts and behaviors needed for cleanroom reimplementation.

## Status Legend
- `[ ]` Not Started
- `[IN PROGRESS]` Currently being worked on
- `[DONE]` Completed

## Priority Levels
- P0: Critical - Core daemon functionality
- P1: High - Essential features
- P2: Medium - Important but not blocking
- P3: Low - Nice to have

---

## Core Architecture & Concepts

### [P0] [ ] 01-ARCHITECTURE.md
**Priority**: P0
**Status**: Not Started
**Description**: High-level architecture overview describing:
- Daemon components and their responsibilities
- Communication patterns between components
- Deployment model (single user daemon)
- Security model (Unix socket permissions, no authentication)
- Lifecycle management

### [P0] [DONE] 02-DATA-MODEL.md
**Priority**: P0
**Status**: Done
**Description**: Complete data model specification including:
- Session entity with all fields and their semantics
- ConversationEvent entity and event types
- Approval entity for local approvals
- FileSnapshot entity
- MCPServer configuration entity
- UserSettings entity
- RecentPath tracking
- All enumerations (SessionStatus, ApprovalStatus, EventType)
- Entity relationships and constraints

---

## API Specifications

### [P0] [ ] 03-JSONRPC-API.md
**Priority**: P0
**Status**: Not Started
**Description**: Complete JSON-RPC 2.0 API specification over Unix sockets:
- Transport layer (Unix socket, line-delimited JSON)
- Request/response format
- Error codes and error handling
- All RPC methods with request/response schemas
- Health check endpoint
- Session management methods (launch, continue, interrupt, list, get state)
- Conversation retrieval methods
- Approval management methods (fetch, decide)
- Subscription methods for event streaming
- Connection lifecycle and concurrency model

### [P0] [ ] 04-REST-API.md
**Priority**: P0
**Status**: Not Started
**Description**: Complete REST HTTP API specification:
- Base URL and port configuration
- Authentication (none - localhost only)
- All endpoints with HTTP methods, paths, query parameters
- Request/response schemas (JSON)
- Error responses and status codes
- CORS configuration
- Session CRUD operations
- Approval operations
- Settings operations
- File snapshot operations
- Recent paths operations

### [P0] [ ] 05-SSE-EVENTS.md
**Priority**: P0
**Status**: Not Started
**Description**: Server-Sent Events (SSE) specification:
- SSE endpoint and connection lifecycle
- Event format and structure
- Event types (new_approval, approval_resolved, session_status_changed, etc.)
- Event filtering by session_id, run_id, event_types
- Heartbeat mechanism
- Reconnection handling
- Client requirements

---

## State Machine Specifications

### [P0] [ ] 06-SESSION-LIFECYCLE.md
**Priority**: P0
**Status**: Not Started
**Description**: Session state machine specification:
- All session states (draft, starting, running, completed, failed, waiting_input, interrupting, interrupted, discarded)
- Valid state transitions with triggering events
- State transition side effects
- Error handling and recovery
- Resume behavior for interrupted sessions
- Parent-child session relationships (continue operations)
- Timeout behaviors

### [P1] [ ] 07-APPROVAL-WORKFLOW.md
**Priority**: P1
**Status**: Not Started
**Description**: Approval workflow specification:
- Local approval lifecycle
- Approval states (pending, approved, denied)
- Correlation between tool calls and approvals
- Approval creation triggers
- Decision processing (approve/deny with comment)
- Timeout behaviors
- Permission prompt tool integration

---

## Integration Specifications

### [P1] [ ] 08-MCP-INTEGRATION.md
**Priority**: P1
**Status**: Not Started
**Description**: MCP server integration specification:
- MCP server lifecycle (launch, monitor, terminate)
- Communication protocol (stdin/stdout)
- Server configuration format
- Tool discovery and execution
- Error handling and recovery
- Server health monitoring
- Environment variable handling

### [P1] [ ] 09-CLAUDECODE-INTEGRATION.md
**Priority**: P1
**Status**: Not Started
**Description**: Claude Code SDK integration specification:
- Session configuration mapping
- Model selection and configuration
- Working directory handling
- Tool allowlist/denylist semantics
- Permission prompt tool integration
- Result capture and storage
- Error propagation
- Token usage tracking
- Cost calculation

---

## Storage Specifications

### [P0] [ ] 10-DATABASE-SCHEMA.md
**Priority**: P0
**Status**: Not Started
**Description**: SQLite database schema specification:
- All tables with columns, types, constraints
- Indexes for query performance
- Migration strategy
- Data retention policies
- Concurrent access patterns
- Transaction boundaries
- Schema version tracking

### [P2] [ ] 11-FILE-SNAPSHOTS.md
**Priority**: P2
**Status**: Not Started
**Description**: File snapshot capture specification:
- Snapshot capture triggers (Read tool calls)
- Snapshot storage format
- Snapshot retrieval API
- Storage limits and cleanup
- Path resolution (relative vs absolute)

---

## Event Bus Specifications

### [P1] [ ] 12-EVENT-BUS.md
**Priority**: P1
**Status**: Not Started
**Description**: Internal event bus specification:
- Event types and schemas
- Subscription model
- Event delivery guarantees (best effort)
- Event filtering
- Subscription lifecycle
- Heartbeat mechanism
- Backpressure handling

---

## Configuration Specifications

### [P1] [ ] 13-CONFIGURATION.md
**Priority**: P1
**Status**: Not Started
**Description**: Daemon configuration specification:
- Environment variables with defaults
- Configuration file format (if any)
- Socket path configuration
- HTTP port configuration
- Database path configuration
- Logging configuration
- Debug mode
- Version override
- Shutdown timeout
- Permission monitor interval

---

## Security & Reliability

### [P1] [ ] 14-SECURITY-MODEL.md
**Priority**: P1
**Status**: Not Started
**Description**: Security model specification:
- Unix socket permissions (0600)
- Single-user isolation
- No authentication (filesystem-based security)
- HTTP localhost-only binding
- Dangerous permission timeout mechanism
- Auto-accept edits safety
- Environment variable sanitization

### [P2] [ ] 15-ERROR-HANDLING.md
**Priority**: P2
**Status**: Not Started
**Description**: Error handling specification:
- Error categories and codes
- Error response formats (JSON-RPC, REST)
- Graceful degradation strategies
- Orphaned session recovery
- Stale socket handling
- Database corruption recovery
- Session crash handling

### [P2] [ ] 16-GRACEFUL-SHUTDOWN.md
**Priority**: P2
**Status**: Not Started
**Description**: Graceful shutdown specification:
- Shutdown signal handling (SIGINT, SIGTERM)
- Session interruption process
- Connection draining
- Resource cleanup order
- Timeout behavior
- Status persistence

---

## Testing Specifications

### [P2] [ ] 17-TEST-CONTRACTS.md
**Priority**: P2
**Status**: Not Started
**Description**: Test contract specifications:
- Unit test isolation requirements
- Integration test setup/teardown
- E2E test scenarios
- Test database management
- Socket path isolation
- Mock interfaces

---

## Advanced Features

### [P2] [ ] 18-PROXY-CONFIGURATION.md
**Priority**: P2
**Status**: Not Started
**Description**: Proxy/OpenRouter integration specification:
- Proxy configuration per session
- API key handling
- Model override behavior
- Base URL configuration
- Error handling for proxy failures

### [P3] [ ] 19-TELEMETRY.md
**Priority**: P3
**Status**: Not Started
**Description**: Telemetry and metrics specification:
- Opt-in/opt-out mechanism
- Metrics collected
- Token usage tracking
- Cost calculation
- Performance metrics
- Error rate tracking

### [P3] [ ] 20-SEARCH-INDEXING.md
**Priority**: P3
**Status**: Not Started
**Description**: Session search specification:
- Title-based search
- Full-text search in queries
- Search ranking
- Search result limits
- Search performance requirements

---

## Implementation Notes

- All specifications should define external contracts only (black-box)
- No implementation details (internal algorithms, optimization strategies)
- Focus on observable behaviors and invariants
- Include examples of valid/invalid inputs
- Define error conditions precisely
- Specify timing guarantees where critical

## Current Focus

**Completed**: 02-DATA-MODEL.md - Comprehensive data model with all entities, fields, relationships, and constraints
**Next Task**: 03-JSONRPC-API.md - Complete JSON-RPC 2.0 API specification as it defines the primary daemon interface
