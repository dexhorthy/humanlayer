# Plan: Implement `npx humanlayer create` Command

## Overview
Create a `npx humanlayer create NAME` command that scaffolds 12-factor agent projects using the template from 12-factor-agents repo.

## Developer Agent Instructions

**ADOPT THE PERSONA**: You MUST first read and adopt `.promptx/personas/agent-developer.md` before proceeding.

## Implementation Tasks

### 1. Update HumanLayer SDK Models (v1Beta3)
**Source of Truth**: `/Users/dex/go/src/github.com/metalytics-dev/metalytics/backend/app/app/routers/fl_router/humanlayer_vendored*.py`

**Files to Update**:
- `humanlayer-ts/src/models.ts` - Update TypeScript models to match v1Beta3
- `humanlayer/models.py` - Update Python models to match v1Beta3

**Key Changes Needed**:
- Add `V1Beta3ConversationCreated` webhook type
- Add `V1Beta3FunctionCallCompleted` with approval status union
- Add `V1Beta3HumanContactCompleted` with completion status
- Update `ConversationCreatedEventPayload` structure
- Add `contact_channel_id` fields throughout

### 2. Create TypeScript Template in CLI

**Source Template**: `/Users/dex/go/src/github.com/humanlayer/humanlayer/12fa-template/` (copied from ../12-factor-agents)

**Target Location**: `hlyr/templates/typescript/`

**Template Structure to Copy**:
```
hlyr/templates/typescript/
├── package.json (with template placeholders)
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── agent.ts
│   ├── server.ts
│   ├── state.ts
│   └── a2h.ts
├── baml_src/
│   ├── agent.baml
│   ├── clients.baml
│   ├── generators.baml
│   └── tool_calculator.baml
└── README.md (generic template)
```

**Template Variables to Support**:
- `{{PROJECT_NAME}}` - Replace "my-agent" in package.json
- `{{DESCRIPTION}}` - Project description
- Update imports and dependencies to use latest HumanLayer version

### 3. Update CLI Build Process

**Files to Modify**:
- `hlyr/package.json` - Add build steps for templates
- `hlyr/tsup.config.ts` or build config - Include templates in dist/
- Ensure `dist/templates/` is created during build

### 4. Implement `create` Command

**File**: `hlyr/src/commands/create.ts` (new file)

**Command Signature**: 
- `npx humanlayer create NAME` - Creates new directory
- `npx humanlayer create .` - Uses current directory

**Functionality**:
- Check for conflicts (existing files)
- Create directory if needed (for NAME syntax)
- Copy template files with variable substitution
- Run `npm install` in target directory
- Print setup instructions

**Template Processing**:
- Replace `{{PROJECT_NAME}}` with actual project name
- Update package.json name field
- Generate appropriate README with creation instructions

**CLI Integration**:
- Add to `hlyr/src/cli.ts` command registry
- Add help text and usage examples

### 5. Test Setup and Validation

**Testing Steps**:
1. Use `npm link` from hlyr repo for local testing
2. Test `npx humanlayer create tmp-test`
3. Verify all files copied correctly
4. Test template substitution
5. Run `npx tsx src/index.ts 'what is 3 + 4'` in created project
6. Ensure agent responds correctly

**Expected Behavior**:
- Project creates successfully
- Dependencies install without errors
- Basic agent functionality works
- BAML client generates correctly
- Calculator tools work (add, subtract, multiply, divide)

## File Modification Strategy

### Read First (Per Dan Abramov Rules)
- Read ENTIRE hlyr/src/cli.ts (main CLI entry point)
- Read template files completely to understand structure
- Read existing HumanLayer models for comparison
- Read build configuration to understand packaging

### Implementation Order
1. **Models Update**: Sync v1Beta3 models first
2. **Template Setup**: Copy and prepare template structure  
3. **Build Configuration**: Ensure templates are packaged
4. **Create Command**: Implement core functionality
5. **CLI Integration**: Wire up command in main CLI
6. **Testing**: Validate end-to-end workflow

## Key Technical Details

**BAML Integration**:
- Template uses BAML for agent prompting
- Includes calculator tools (add, subtract, multiply, divide)
- Has approval flow for "divide" operations
- Supports human clarification requests

**HumanLayer Integration**:
- Uses latest SDK version
- Supports CLI and webhook modes
- Includes email/slack contact channels
- Has approval and human-as-tool patterns

**TypeScript Setup**:
- Uses tsx for development
- Standard TypeScript build with tsc
- Express server for HTTP endpoints
- File-based state management

## Success Criteria
1. `npx humanlayer create my-test-agent` works end-to-end
2. Created project has all template files
3. `npm install` succeeds in created project
4. Agent responds to `npx tsx src/index.ts 'what is 3 + 4'`
5. Models match v1Beta3 specification from metalytics repo
6. Build process includes templates in CLI distribution

## Notes
- Follow existing CLI patterns in hlyr/
- Maintain consistency with current command structure
- Ensure template works with latest HumanLayer SDK
- Test thoroughly before considering complete
- Commit every 5-10 minutes of meaningful progress