#!/usr/bin/env node

import { Command } from 'commander'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { thoughtsCommand } from './commands/thoughts.js'
import { CommandRegistry } from './commands/registry.js'
import { resolveConfigWithSources, maskSensitiveValue, resolveFullConfig } from './config.js'
import { getProject } from './hlClient.js'
import chalk from 'chalk'
import { tuiCommand } from './commands/tui.js'

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'),
)

function showAbbreviatedConfig() {
  const configWithSources = resolveConfigWithSources({})
  console.log(`\n${chalk.yellow('Current configuration:')}`)
  console.log(
    `  API Base URL: ${chalk.cyan(configWithSources.api_base_url.value)} ${chalk.gray(
      `(${configWithSources.api_base_url.sourceName})`,
    )}`,
  )
  console.log(
    `  App Base URL: ${chalk.cyan(configWithSources.app_base_url.value)} ${chalk.gray(
      `(${configWithSources.app_base_url.sourceName})`,
    )}`,
  )
  const apiKeyDisplay = configWithSources.api_key?.value
    ? chalk.green(maskSensitiveValue(configWithSources.api_key.value))
    : chalk.red(maskSensitiveValue(undefined))
  console.log(`  API Key: ${apiKeyDisplay} ${chalk.gray(`(${configWithSources.api_key?.sourceName})`)}`)
}

async function authenticate() {
  const config = resolveFullConfig({})
  if (!config.api_key) {
    console.error('Error: No HumanLayer API token found.')
    showAbbreviatedConfig()
    process.exit(1)
  }
  try {
    await getProject(config.api_base_url, config.api_key)
  } catch (error) {
    console.error(chalk.red('Authentication failed:'), error)
    showAbbreviatedConfig()
    process.exit(1)
  }
}

// Initialize program and registry
const program = new Command()
const registry = new CommandRegistry()

program
  .name('humanlayer')
  .description('HumanLayer, but on your command-line.')
  .version(packageJson.version)

// Set up authentication hook
program.hook('preAction', async (_, actionCmd) => {
  const path: string[] = []
  let cmd: Command | null = actionCmd
  while (cmd && cmd.name() !== 'humanlayer') {
    path.unshift(cmd.name())
    cmd = cmd.parent
  }
  const unprotected = registry.getUnprotectedCommands()
  if (!path.some(name => unprotected.includes(name))) {
    await authenticate()
  }
})

// Apply all registered commands to the program
registry.applyToProgram(program)

// Special handling for thoughts command (it manages its own subcommands)
thoughtsCommand(program)

// Set up default action when no command is provided
program.action(() => tuiCommand())

// Handle unknown commands and error output
program.on('command:*', operands => {
  console.error(`Unknown command: ${operands[0]}\nRun "humanlayer --help" for available commands`)
  process.exit(1)
})

program.configureOutput({
  writeErr: str => {
    if (str.includes('too many arguments')) {
      console.error('Unknown command\nRun "humanlayer --help" for available commands')
      process.exit(1)
    }
    process.stderr.write(str)
  },
})

program.parse(process.argv)
