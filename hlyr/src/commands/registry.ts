import { Command } from 'commander'
import { spawn } from 'child_process'
import { loginCommand } from './login.js'
import { tuiCommand } from './tui.js'
import { contactHumanCommand } from './contactHuman.js'
import { configShowCommand } from './configShow.js'
import { pingCommand } from './ping.js'
import { launchCommand } from './launch.js'
import { alertCommand } from './alert.js'
import { joinWaitlistCommand } from './joinWaitlist.js'
import { startDefaultMCPServer, startClaudeApprovalsMCPServer } from '../mcp.js'
import { getDefaultConfigPath } from '../config.js'
import { generateDocsCommand } from './generateDocs.js'

export interface CommandOption {
  flags: string
  description: string
  defaultValue?: unknown
  parser?: (value: string, previous?: unknown) => unknown
  required?: boolean
}

export interface RegisteredCommand {
  name: string
  alias?: string
  description: string
  arguments?: string
  options?: CommandOption[]
  requiresAuth: boolean
  action: (...args: unknown[]) => void | Promise<void>
  subcommands?: RegisteredCommand[]
}

export class CommandRegistry {
  private commands: Map<string, RegisteredCommand> = new Map()
  private additionalUnprotectedCommands: string[] = ['thoughts']

  constructor() {
    this.registerBuiltInCommands()
  }

  register(command: RegisteredCommand): void {
    this.commands.set(command.name, command)
  }

  getCommand(name: string): RegisteredCommand | undefined {
    return this.commands.get(name)
  }

  getAllCommands(): RegisteredCommand[] {
    return Array.from(this.commands.values())
  }

  getUnprotectedCommands(): string[] {
    const registeredUnprotected = Array.from(this.commands.values())
      .filter(cmd => !cmd.requiresAuth)
      .map(cmd => cmd.name)
    return [...registeredUnprotected, ...this.additionalUnprotectedCommands]
  }

  applyToProgram(program: Command): void {
    for (const cmdDef of this.commands.values()) {
      this.addCommandToProgram(program, cmdDef)
    }
  }

  private addCommandToProgram(parent: Command, cmdDef: RegisteredCommand): void {
    const cmd = parent.command(cmdDef.name)

    if (cmdDef.alias) {
      cmd.alias(cmdDef.alias)
    }

    cmd.description(cmdDef.description)

    if (cmdDef.arguments) {
      cmd.argument(cmdDef.arguments)
    }

    if (cmdDef.options) {
      for (const opt of cmdDef.options) {
        if (opt.required) {
          cmd.requiredOption(opt.flags, opt.description, opt.parser)
        } else if (opt.defaultValue !== undefined) {
          cmd.option(opt.flags, opt.description, opt.parser || undefined, opt.defaultValue)
        } else {
          cmd.option(opt.flags, opt.description, opt.parser)
        }
      }
    }

    if (cmdDef.subcommands) {
      for (const subcmd of cmdDef.subcommands) {
        this.addCommandToProgram(cmd, subcmd)
      }
    } else {
      cmd.action(cmdDef.action)
    }
  }

  generateDocumentation(): string {
    const lines: string[] = ['# HumanLayer CLI Commands\n']

    const sortedCommands = this.getAllCommands().sort((a, b) => a.name.localeCompare(b.name))

    for (const cmd of sortedCommands) {
      lines.push(`## ${cmd.name}`)
      lines.push(`\n${cmd.description}`)

      if (!cmd.requiresAuth) {
        lines.push('\n**Note:** This command does not require authentication.')
      }

      if (cmd.arguments) {
        lines.push(`\n**Arguments:** \`${cmd.arguments}\``)
      }

      if (cmd.options && cmd.options.length > 0) {
        lines.push('\n**Options:**')
        for (const opt of cmd.options) {
          lines.push(`- \`${opt.flags}\`: ${opt.description}`)
        }
      }

      if (cmd.subcommands && cmd.subcommands.length > 0) {
        lines.push('\n**Subcommands:**')
        for (const subcmd of cmd.subcommands) {
          lines.push(`- \`${subcmd.name}\`: ${subcmd.description}`)
        }
      }

      lines.push('')
    }

    return lines.join('\n')
  }

  private registerBuiltInCommands(): void {
    // Login command
    this.register({
      name: 'login',
      description: 'Login to HumanLayer and save API token',
      requiresAuth: false,
      options: [
        { flags: '--api-base <url>', description: 'API base URL' },
        { flags: '--app-base <url>', description: 'App base URL' },
        { flags: '--config-file <path>', description: 'Path to config file' },
      ],
      action: loginCommand,
    })

    // TUI command
    this.register({
      name: 'tui',
      description: 'Run the HumanLayer Terminal UI',
      requiresAuth: true,
      options: [
        { flags: '--daemon-socket <path>', description: 'Path to daemon socket' },
        { flags: '--config-file <path>', description: 'Path to config file' },
      ],
      action: tuiCommand,
    })

    // Launch command
    this.register({
      name: 'launch',
      description: 'Launch a new Claude Code session via the daemon',
      arguments: '<query>',
      requiresAuth: false,
      options: [
        {
          flags: '-m, --model <model>',
          description: 'Model to use (opus or sonnet)',
          defaultValue: 'sonnet',
        },
        { flags: '-w, --working-dir <path>', description: 'Working directory for the session' },
        {
          flags: '--max-turns <number>',
          description: 'Maximum number of turns',
          parser: (value: string) => parseInt(value, 10),
        },
        {
          flags: '--no-approvals',
          description: 'Disable HumanLayer approvals for high-stakes operations',
        },
        { flags: '--daemon-socket <path>', description: 'Path to daemon socket' },
        { flags: '--config-file <path>', description: 'Path to config file' },
      ],
      action: launchCommand,
    })

    // Config command with subcommands
    this.register({
      name: 'config',
      description: 'Configuration management',
      requiresAuth: false,
      subcommands: [
        {
          name: 'edit',
          description: 'Edit configuration file in $EDITOR',
          requiresAuth: false,
          options: [{ flags: '--config-file <path>', description: 'Path to config file' }],
          action: (options: { configFile?: string }) => {
            const editor = process.env.EDITOR || 'vi'
            const configFile = options.configFile || getDefaultConfigPath()
            spawn(editor, [configFile], { stdio: 'inherit' })
          },
        },
        {
          name: 'show',
          description: 'Show current configuration',
          requiresAuth: false,
          options: [
            { flags: '--config-file <path>', description: 'Path to config file' },
            { flags: '--slack-channel <id>', description: 'Slack channel or user ID' },
            { flags: '--slack-bot-token <token>', description: 'Slack bot token' },
            {
              flags: '--slack-context <context>',
              description: 'Context about the Slack channel or user',
            },
            { flags: '--slack-thread-ts <ts>', description: 'Slack thread timestamp' },
            { flags: '--slack-blocks [boolean]', description: 'Use experimental Slack blocks' },
            { flags: '--email-address <email>', description: 'Email address to contact' },
            { flags: '--email-context <context>', description: 'Context about the email recipient' },
            { flags: '--json', description: 'Output as JSON with masked keys' },
          ],
          action: configShowCommand,
        },
      ],
    })

    // Contact human command
    this.register({
      name: 'contact_human',
      description: 'Contact a human with a message',
      requiresAuth: true,
      options: [
        {
          flags: '-m, --message <text>',
          description: 'The message to send (use "-" to read from stdin)',
          required: true,
        },
        { flags: '--slack-channel <id>', description: 'Slack channel or user ID' },
        { flags: '--slack-bot-token <token>', description: 'Slack bot token' },
        { flags: '--slack-context <context>', description: 'Context about the Slack channel or user' },
        { flags: '--slack-thread-ts <ts>', description: 'Slack thread timestamp' },
        {
          flags: '--slack-blocks [boolean]',
          description: 'Use experimental Slack blocks',
          defaultValue: true,
        },
        { flags: '--email-address <email>', description: 'Email address to contact' },
        { flags: '--email-context <context>', description: 'Context about the email recipient' },
      ],
      action: contactHumanCommand,
    })

    // Ping command
    this.register({
      name: 'ping',
      description: 'Check authentication and display current project',
      requiresAuth: true,
      options: [],
      action: pingCommand,
    })

    // Alert command
    this.register({
      name: 'alert',
      description: 'Monitor daemon for new approval alerts with audio notifications',
      requiresAuth: true,
      options: [
        {
          flags: '--event-types <types...>',
          description: 'Event types to watch (default: new_approval)',
        },
        { flags: '--session-id <id>', description: 'Filter by session ID' },
        { flags: '--run-id <id>', description: 'Filter by run ID' },
        { flags: '--sound-file <path>', description: 'Custom sound file to play on alerts' },
        { flags: '--quiet', description: 'Disable sound notifications' },
        { flags: '--daemon-socket <path>', description: 'Path to daemon socket' },
      ],
      action: alertCommand,
    })

    // MCP command with subcommands
    this.register({
      name: 'mcp',
      description: 'MCP server functionality',
      requiresAuth: false,
      subcommands: [
        {
          name: 'serve',
          description: 'Start the default MCP server for contact_human functionality',
          requiresAuth: false,
          options: [],
          action: startDefaultMCPServer,
        },
        {
          name: 'claude_approvals',
          description: 'Start the Claude approvals MCP server for permission requests',
          requiresAuth: false,
          options: [],
          action: startClaudeApprovalsMCPServer,
        },
        {
          name: 'wrapper',
          description:
            'Wrap an existing MCP server with human approval functionality (not implemented yet)',
          requiresAuth: false,
          options: [],
          action: () => {
            console.log('MCP wrapper functionality is not implemented yet.')
            console.log('This will allow wrapping any existing MCP server with human approval.')
            process.exit(1)
          },
        },
        {
          name: 'inspector',
          description: 'Run MCP inspector for debugging MCP servers',
          arguments: '[command]',
          requiresAuth: false,
          options: [],
          action: (command = 'serve') => {
            const args = ['@modelcontextprotocol/inspector', 'node', 'dist/index.js', 'mcp', command]
            spawn('npx', args, { stdio: 'inherit', cwd: process.cwd() })
          },
        },
      ],
    })

    // Join waitlist command
    this.register({
      name: 'join-waitlist',
      description: 'Join the HumanLayer Code early access waitlist',
      requiresAuth: false,
      options: [{ flags: '--email <email>', description: 'Your email address', required: true }],
      action: joinWaitlistCommand,
    })

    // Generate docs command
    this.register({
      name: 'generate-docs',
      description: 'Generate documentation for all CLI commands',
      requiresAuth: false,
      options: [
        {
          flags: '--output <path>',
          description: 'Output file path (prints to stdout if not specified)',
        },
      ],
      action: generateDocsCommand,
    })
  }
}
