# {{PROJECT_NAME}}

A 12-factor agent project created with HumanLayer CLI.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Generate BAML client:

   ```bash
   npx baml-cli generate
   ```

3. Set your API keys:

   ```bash
   export OPENAI_API_KEY=your_openai_key_here
   export HUMANLAYER_API_KEY=your_humanlayer_key_here
   ```

4. Run the agent:
   ```bash
   npx tsx src/index.ts "what is 3 + 4"
   ```

## Features

- **Calculator Tools**: Add, subtract, multiply, divide operations
- **Human Approval**: Division operations require human approval
- **Human Clarification**: Request clarification for unclear inputs
- **BAML Integration**: Structured prompting with type-safe outputs
- **HumanLayer Integration**: Contact humans via email, Slack, or CLI

## Architecture

- `src/index.ts` - CLI entry point
- `src/agent.ts` - Main agent logic and tool handling
- `src/cli.ts` - Command-line interface
- `src/server.ts` - HTTP server (optional)
- `baml_src/` - BAML configuration and prompts

## Development

Run in development mode:

```bash
npm run dev "your question here"
```

Build the project:

```bash
npm run build
```

## Learn More

- [HumanLayer Documentation](https://humanlayer.dev/docs)
- [12-Factor Agents](https://github.com/humanlayer/12-factor-agents)
- [BAML Documentation](https://docs.boundaryml.com)
