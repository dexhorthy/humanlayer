# HLD Data Model Specification

**Version**: 1.0
**Status**: Draft
**Last Updated**: 2025-10-28

## Overview

This document specifies the complete data model for the HumanLayer Daemon (HLD). All entities, fields, relationships, and constraints are defined as black-box contracts for cleanroom implementation.

## Core Principles

1. **Immutability**: ConversationEvents are append-only; Sessions are mutable with explicit update semantics
2. **Time Tracking**: All entities track creation time; Sessions track last activity and completion
3. **Nullability**: Optional fields use explicit null semantics
4. **Identifiers**: UUIDs for cross-process entities; auto-increment integers for internal sequences

---

## Entity: Session

A Session represents a single execution of Claude Code, including all configuration, state, and results.

### Fields

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string (UUID) | No | Generated | Unique session identifier |
| `run_id` | string (UUID) | No | Generated | Unique run identifier (changes on resume) |
| `claude_session_id` | string (UUID) | Yes | NULL | Claude SDK session ID (assigned after start) |
| `parent_session_id` | string (UUID) | Yes | NULL | Parent session ID if this is a continuation |
| `query` | string | No | "" | User's query/request to Claude |
| `summary` | string | Yes | "" | Auto-generated summary of session |
| `title` | string | Yes | "" | User-editable display title |
| `model` | string | Yes | NULL | Model name (e.g., "opus", "sonnet") |
| `model_id` | string | Yes | NULL | Full model identifier (e.g., "claude-opus-4-1-20250805") |
| `working_dir` | string | Yes | NULL | Absolute path to working directory |
| `max_turns` | integer | No | 0 | Maximum conversation turns (0 = unlimited) |
| `system_prompt` | string | Yes | "" | Override system prompt |
| `append_system_prompt` | string | Yes | "" | Append to system prompt |
| `custom_instructions` | string | Yes | "" | Custom instructions for Claude |
| `permission_prompt_tool` | string | Yes | NULL | MCP tool name for permission prompts |
| `allowed_tools` | string (JSON array) | Yes | NULL | JSON array of allowed tool patterns |
| `disallowed_tools` | string (JSON array) | Yes | NULL | JSON array of disallowed tool patterns |
| `additional_directories` | string (JSON array) | Yes | NULL | JSON array of additional directory paths |
| `status` | string (enum) | No | "starting" | Current session status (see SessionStatus enum) |
| `created_at` | timestamp | No | NOW() | Session creation time (ISO 8601 UTC) |
| `last_activity_at` | timestamp | No | NOW() | Last activity time (ISO 8601 UTC) |
| `completed_at` | timestamp | Yes | NULL | Session completion time (ISO 8601 UTC) |
| `cost_usd` | float | Yes | NULL | Total cost in USD |
| `input_tokens` | integer | Yes | NULL | Total input tokens consumed |
| `output_tokens` | integer | Yes | NULL | Total output tokens generated |
| `cache_creation_input_tokens` | integer | Yes | NULL | Cache creation tokens |
| `cache_read_input_tokens` | integer | Yes | NULL | Cache read tokens |
| `effective_context_tokens` | integer | Yes | NULL | Effective context size |
| `duration_ms` | integer | Yes | NULL | Total execution duration in milliseconds |
| `num_turns` | integer | Yes | NULL | Actual number of conversation turns |
| `result_content` | string | Yes | "" | Final result/output content |
| `error_message` | string | Yes | "" | Error message if session failed |
| `auto_accept_edits` | boolean | No | false | Auto-accept file edits without approval |
| `dangerously_skip_permissions` | boolean | No | false | Skip all permission checks |
| `dangerously_skip_permissions_expires_at` | timestamp | Yes | NULL | Expiration time for dangerous permissions |
| `dangerously_skip_permissions_timeout_ms` | integer | Yes | NULL | Timeout in milliseconds for dangerous permissions |
| `archived` | boolean | No | false | Whether session is archived |
| `proxy_enabled` | boolean | No | false | Whether to use proxy/OpenRouter |
| `proxy_base_url` | string | Yes | NULL | Proxy service base URL |
| `proxy_model_override` | string | Yes | NULL | Model to use with proxy |
| `proxy_api_key` | string | Yes | NULL | API key for proxy service |
| `editor_state` | string (JSON) | Yes | NULL | Editor state for draft sessions (JSON blob) |

### Field Semantics

#### Identity Fields
- `id`: Primary identifier, never changes across resumes
- `run_id`: Changes with each resume/continue operation
- `claude_session_id`: Assigned by Claude SDK after session starts
- `parent_session_id`: Links continued sessions to their parent

#### Query and Instructions
- `query`: Required, can be updated for draft sessions before launch
- `summary`: Auto-generated from conversation, read-only
- `title`: User-editable display name, defaults to truncated query
- `system_prompt`: Completely replaces default system prompt if set
- `append_system_prompt`: Appends to system prompt (additive)
- `custom_instructions`: Additional instructions from user

#### Tool Control
- `allowed_tools`: Whitelist patterns (e.g., ["Read", "Bash(ls:*)"])
- `disallowed_tools`: Blacklist patterns (e.g., ["Write", "Bash(rm:*)"])
- `permission_prompt_tool`: MCP tool to call for permission requests
- Tool patterns support wildcards and parameter matching

#### Safety Controls
- `auto_accept_edits`: If true, Edit/Write tools don't require approval
- `dangerously_skip_permissions`: If true, ALL tools skip approval
- `dangerously_skip_permissions_expires_at`: Auto-resets to false at this time
- `dangerously_skip_permissions_timeout_ms`: Duration for auto-expiry

#### Metrics
- All token fields are cumulative across session and resumes
- `cost_usd`: Calculated from token usage and model pricing
- `duration_ms`: Wall-clock time from start to completion
- `num_turns`: Count of user/assistant message pairs

#### Proxy Configuration
- Proxy fields are mutually dependent (all or none)
- `proxy_enabled`: Must be true for other proxy fields to apply
- Used for OpenRouter or custom inference proxies

#### Editor State
- `editor_state`: JSON blob storing UI editor state for draft sessions
- Format is opaque to daemon, managed by frontend

### Constraints

1. `id` is unique across all sessions
2. `run_id` is unique across all runs (including resumes)
3. If `parent_session_id` is set, it must reference a valid session `id`
4. `status` must be a valid SessionStatus value
5. If `completed_at` is set, `status` must be terminal (completed, failed, interrupted, discarded)
6. If `dangerously_skip_permissions_expires_at` is set, `dangerously_skip_permissions` must be true
7. If `proxy_enabled` is true, `proxy_base_url` should be set
8. `allowed_tools` and `disallowed_tools` must be valid JSON arrays or NULL
9. `additional_directories` must be valid JSON array or NULL
10. `editor_state` must be valid JSON or NULL

---

## Enum: SessionStatus

Defines the lifecycle states of a session.

### Values

| Value | Description | Terminal |
|-------|-------------|----------|
| `draft` | Session created but not launched | No |
| `starting` | Session is initializing | No |
| `running` | Session is actively processing | No |
| `waiting_input` | Session is waiting for user input | No |
| `interrupting` | Session received interrupt signal, shutting down | No |
| `interrupted` | Session was interrupted and can be resumed | Yes |
| `completed` | Session finished successfully | Yes |
| `failed` | Session encountered an error | Yes |
| `discarded` | Draft session was discarded by user | Yes |

### State Transition Rules

```
draft → starting (launchSession)
draft → discarded (deleteSession)

starting → running (Claude SDK started)
starting → failed (startup error)

running → waiting_input (tool requires approval)
running → interrupting (interrupt signal received)
running → completed (Claude finishes)
running → failed (execution error)

waiting_input → running (approval granted)
waiting_input → interrupting (interrupt signal received)
waiting_input → failed (approval denied or timeout)

interrupting → interrupted (graceful shutdown complete)
interrupting → failed (shutdown timeout or error)

interrupted → starting (continueSession)

completed → starting (continueSession)
```

### Terminal States

Terminal states do not transition to other states except through explicit user actions:
- `completed` → `starting` via continueSession
- `interrupted` → `starting` via continueSession
- `failed`, `discarded` → No transitions

---

## Entity: ConversationEvent

A ConversationEvent represents a single immutable event in a conversation, including messages, tool calls, and tool results.

### Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | integer (auto-increment) | No | Unique event identifier |
| `session_id` | string (UUID) | No | Session this event belongs to |
| `claude_session_id` | string (UUID) | Yes | Claude SDK session ID |
| `sequence` | integer | No | Sequence number within session (0-based) |
| `event_type` | string (enum) | No | Type of event (see EventType enum) |
| `created_at` | timestamp | No | Event creation time (ISO 8601 UTC) |
| `role` | string (enum) | Yes | Message role: "user", "assistant", "system" |
| `content` | string | Yes | Message content (for message events) |
| `tool_id` | string | Yes | Tool use ID (for tool_call events) |
| `tool_name` | string | Yes | Tool name (for tool_call events) |
| `tool_input_json` | string (JSON) | Yes | Tool input as JSON string |
| `parent_tool_use_id` | string | Yes | Parent tool use ID (for nested tools) |
| `tool_result_for_id` | string | Yes | Tool ID this result is for (tool_result events) |
| `tool_result_content` | string | Yes | Tool result content |
| `is_completed` | boolean | No | Whether tool call has received result |
| `approval_status` | string (enum) | Yes | Approval status (NULL, "pending", "approved", "denied") |
| `approval_id` | string | Yes | HumanLayer approval ID when correlated |

### Field Semantics

#### Identity and Ordering
- `id`: Database auto-increment, unique across all events
- `session_id`: Links event to session
- `claude_session_id`: Links to specific Claude SDK session (changes on resume)
- `sequence`: Monotonically increasing within a session, used for ordering

#### Event Type Dispatch
- `event_type`: Determines which other fields are populated
- `message`: Uses `role`, `content`
- `tool_call`: Uses `tool_id`, `tool_name`, `tool_input_json`, `parent_tool_use_id`
- `tool_result`: Uses `tool_result_for_id`, `tool_result_content`
- `system`: Uses `content` (role may be "system")
- `thinking`: Uses `content` (Claude's chain-of-thought)

#### Tool Call Lifecycle
- `is_completed`: False when tool_call created, true when tool_result received
- `approval_status`: NULL (no approval), "pending", "approved", "denied"
- `approval_id`: Links to local Approval entity or HumanLayer cloud approval

### Constraints

1. `id` is unique and auto-incrementing
2. `session_id` must reference a valid Session
3. `sequence` is unique within a `session_id`
4. `event_type` must be a valid EventType value
5. If `event_type` is "message", `role` and `content` must be set
6. If `event_type` is "tool_call", `tool_id` and `tool_name` must be set
7. If `event_type` is "tool_result", `tool_result_for_id` must reference a valid `tool_id`
8. `approval_status` must be NULL or a valid ApprovalStatus value
9. If `approval_id` is set, `approval_status` must be set

---

## Enum: EventType

Defines the types of conversation events.

### Values

| Value | Description |
|-------|-------------|
| `message` | Chat message (user, assistant, or system) |
| `tool_call` | Tool invocation request |
| `tool_result` | Tool execution result |
| `system` | System notification or metadata |
| `thinking` | Claude's internal reasoning (chain-of-thought) |

---

## Enum: ApprovalStatus

Defines the status of an approval request.

### Values

| Value | Description |
|-------|-------------|
| NULL | No approval needed |
| `pending` | Awaiting approval decision |
| `approved` | Approved by user |
| `denied` | Denied by user |
| `resolved` | Generically resolved (external resolution) |

---

## Entity: Approval

An Approval represents a local approval request for a tool call.

### Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | No | Unique approval identifier |
| `run_id` | string (UUID) | No | Run ID this approval belongs to |
| `session_id` | string (UUID) | No | Session ID this approval belongs to |
| `tool_use_id` | string | Yes | Tool use ID from ConversationEvent |
| `status` | string (enum) | No | Approval status ("pending", "approved", "denied") |
| `created_at` | timestamp | No | Approval creation time (ISO 8601 UTC) |
| `responded_at` | timestamp | Yes | Time user responded (ISO 8601 UTC) |
| `tool_name` | string | No | Name of tool requiring approval |
| `tool_input` | JSON | No | Tool input parameters as JSON |
| `comment` | string | Yes | User's comment (required for deny) |

### Field Semantics

- `id`: Unique identifier, prefixed with "local-" for local approvals
- `tool_use_id`: Links to ConversationEvent.tool_id
- `status`: Current approval state
- `responded_at`: Set when user approves or denies
- `comment`: Required when denying, optional when approving

### Constraints

1. `id` is unique
2. `session_id` must reference a valid Session
3. `run_id` must match the session's current run_id
4. `status` must be "pending", "approved", or "denied"
5. If `status` is "approved" or "denied", `responded_at` must be set
6. If `status` is "denied", `comment` must be non-empty
7. `tool_input` must be valid JSON

### State Transitions

```
pending → approved (user approves)
pending → denied (user denies)
```

No other transitions are valid.

---

## Entity: FileSnapshot

A FileSnapshot captures the content of a file at the time of a Read tool call.

### Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | integer (auto-increment) | No | Unique snapshot identifier |
| `tool_id` | string | No | Tool use ID of the Read tool call |
| `session_id` | string (UUID) | No | Session ID |
| `file_path` | string | No | Relative or absolute file path |
| `content` | string | No | File content at time of read |
| `created_at` | timestamp | No | Snapshot creation time (ISO 8601 UTC) |

### Constraints

1. `id` is unique and auto-incrementing
2. `tool_id` should reference a ConversationEvent.tool_id
3. `session_id` must reference a valid Session
4. `file_path` is as provided in the Read tool call

---

## Entity: MCPServer

An MCPServer represents the configuration for a Model Context Protocol server.

### Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | integer (auto-increment) | No | Unique server configuration identifier |
| `session_id` | string (UUID) | No | Session this configuration belongs to |
| `name` | string | No | Server name/identifier |
| `command` | string | No | Command to execute |
| `args_json` | string (JSON array) | No | Command arguments as JSON array |
| `env_json` | string (JSON object) | No | Environment variables as JSON object |

### Constraints

1. `id` is unique and auto-incrementing
2. `session_id` must reference a valid Session
3. `name` is unique within a session
4. `args_json` must be a valid JSON array
5. `env_json` must be a valid JSON object

---

## Entity: UserSettings

UserSettings stores daemon-wide user preferences.

### Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `advanced_providers` | boolean | No | Whether to show advanced provider options |
| `opt_in_telemetry` | boolean | Yes | Telemetry opt-in (NULL = not set, true = opted in, false = opted out) |
| `created_at` | timestamp | No | Settings creation time (ISO 8601 UTC) |
| `updated_at` | timestamp | No | Settings last update time (ISO 8601 UTC) |

### Constraints

1. Only one row exists in the table
2. `opt_in_telemetry` uses three-state logic (NULL/true/false)

---

## Entity: RecentPath

A RecentPath tracks recently used working directories.

### Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `path` | string | No | Absolute directory path |
| `last_used` | timestamp | No | Last usage time (ISO 8601 UTC) |
| `usage_count` | integer | No | Number of times used |

### Constraints

1. `path` is unique
2. `usage_count` is incremented on each use
3. `last_used` is updated on each use

---

## Relationships

### Session Hierarchy
```
Session (parent)
  ↓ parent_session_id
Session (child/continuation)
```

A session can have at most one parent (via `parent_session_id`).
A session can have multiple children (multiple continuations).

### Session → ConversationEvent
```
Session (1) ← (N) ConversationEvent
```

One session has many conversation events.
Events are ordered by `sequence` within a session.

### Session → Approval
```
Session (1) ← (N) Approval
```

One session can have multiple approval requests.
Approvals are filtered by `run_id` to match current execution.

### ConversationEvent ↔ Approval
```
ConversationEvent.tool_id ↔ Approval.tool_use_id
```

An approval correlates to a tool_call event via `tool_use_id`.
An approval may also be linked via `ConversationEvent.approval_id`.

### Session → FileSnapshot
```
Session (1) ← (N) FileSnapshot
```

One session can capture multiple file snapshots.

### Session → MCPServer
```
Session (1) ← (N) MCPServer
```

One session can have multiple MCP server configurations.

---

## Invariants

### Session Invariants
1. If `completed_at` is set, `status` must be terminal
2. If `parent_session_id` is set, parent must exist
3. `last_activity_at` >= `created_at`
4. If `completed_at` is set, `completed_at` >= `created_at`
5. Token counts are non-negative or NULL
6. `duration_ms` is non-negative or NULL

### ConversationEvent Invariants
1. `sequence` is dense (no gaps) within a session
2. Tool result events must have matching tool_call events
3. If `is_completed` is true, a tool_result event must exist for `tool_id`
4. `created_at` is monotonically increasing within a session's sequence

### Approval Invariants
1. If `status` is "approved" or "denied", `responded_at` must be set
2. If `status` is "denied", `comment` must be non-empty
3. `responded_at` >= `created_at` if set

---

## Null Semantics

### NULL vs Empty String
- `NULL`: Field is not applicable or not set
- `""` (empty string): Field is applicable but has no value

### Examples
- `parent_session_id = NULL`: This is a root session
- `error_message = ""`: No error occurred
- `summary = ""`: Summary not yet generated
- `title = ""`: User has not set a custom title

### Three-State Logic
Some fields use three states:
- `opt_in_telemetry`: NULL (not set), true (opted in), false (opted out)
- `completed_at`: NULL (not completed), timestamp (completed)

---

## Timestamp Format

All timestamps are stored and transmitted in ISO 8601 UTC format:
```
2025-10-28T15:30:45.123Z
```

- Always UTC (Z suffix)
- Millisecond precision
- RFC 3339 compatible

---

## JSON Field Formats

### allowed_tools / disallowed_tools
```json
["Read", "Write", "Bash(ls:*)", "Bash(grep:*)"]
```

Empty array: `[]`
NULL: No restrictions

### additional_directories
```json
["/path/to/dir1", "/path/to/dir2"]
```

### MCP args_json
```json
["arg1", "arg2", "--flag"]
```

### MCP env_json
```json
{"API_KEY": "secret", "DEBUG": "true"}
```

### editor_state
Opaque JSON blob, format defined by frontend:
```json
{"cursor": {"line": 10, "col": 5}, "scroll": 100}
```

---

## Versioning

This specification is versioned separately from the HLD implementation.

**Current Version**: 1.0

Changes to the data model require:
1. Database migration scripts
2. Specification version increment
3. API compatibility considerations
