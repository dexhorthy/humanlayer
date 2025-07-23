import { writeFileSync } from 'fs'
import { CommandRegistry } from './registry.js'
import chalk from 'chalk'

export function generateDocsCommand(options: { output?: string }): void {
  const registry = new CommandRegistry()
  const documentation = registry.generateDocumentation()

  if (options.output) {
    try {
      writeFileSync(options.output, documentation)
      console.log(chalk.green(`Documentation generated successfully at: ${options.output}`))
    } catch (error) {
      console.error(chalk.red(`Failed to write documentation: ${error}`))
      process.exit(1)
    }
  } else {
    console.log(documentation)
  }
}
