import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { ContactChannel } from 'humanlayer'

// Load environment variables
dotenv.config()

export type ConfigFile = {
  channel: ContactChannel
  api_key?: string
  api_base_url?: string
  app_base_url?: string
}

export type ConfigSource = 'flag' | 'env' | 'config' | 'default' | 'none'

export interface ConfigValue<T = string> {
  value: T
  source: ConfigSource
  sourceName?: string // Specific env var name or file path
}

export interface ConfigSchema {
  api_key: {
    envVar: 'HUMANLAYER_API_KEY'
    configKey: 'api_key'
    flagKey: 'apiKey'
    defaultValue?: string
    required: boolean
  }
  api_base_url: {
    envVar: 'HUMANLAYER_API_BASE'
    configKey: 'api_base_url'
    flagKey: 'apiBase'
    defaultValue: string
    required: boolean
  }
  app_base_url: {
    envVar: 'HUMANLAYER_APP_URL'
    configKey: 'app_base_url'
    flagKey: 'appBase'
    defaultValue: string
    required: boolean
  }
}

const CONFIG_SCHEMA: ConfigSchema = {
  api_key: {
    envVar: 'HUMANLAYER_API_KEY',
    configKey: 'api_key',
    flagKey: 'apiKey',
    required: true,
  },
  api_base_url: {
    envVar: 'HUMANLAYER_API_BASE',
    configKey: 'api_base_url',
    flagKey: 'apiBase',
    defaultValue: 'https://api.humanlayer.dev/humanlayer/v1',
    required: true,
  },
  app_base_url: {
    envVar: 'HUMANLAYER_APP_URL',
    configKey: 'app_base_url',
    flagKey: 'appBase',
    defaultValue: 'https://app.humanlayer.dev',
    required: true,
  },
}

export class ConfigResolver {
  private configFile: ConfigFile
  private configFilePath: string

  constructor(options: { configFile?: string } = {}) {
    this.configFile = this.loadConfigFile(options.configFile)
    this.configFilePath = this.getConfigFilePath(options.configFile)
  }

  private loadConfigFile(configFile?: string): ConfigFile {
    if (configFile) {
      const configContent = fs.readFileSync(configFile, 'utf8')
      return JSON.parse(configContent)
    }

    // these do not merge today
    const configPaths = ['humanlayer.json', getDefaultConfigPath()]

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, 'utf8')
          return JSON.parse(configContent)
        }
      } catch (error) {
        console.error(chalk.yellow(`Warning: Could not parse config file ${configPath}: ${error}`))
      }
    }

    return { channel: {} }
  }

  private getConfigFilePath(configFile?: string): string {
    if (configFile) return configFile

    const configPaths = ['humanlayer.json', getDefaultConfigPath()]
    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          return configPath
        }
      } catch {
        // Continue to next path
      }
    }
    return getDefaultConfigPath() // fallback
  }

  resolveValue<K extends keyof ConfigSchema>(
    key: K,
    options: Record<string, unknown> = {},
  ): ConfigValue<string | undefined> {
    const schema = CONFIG_SCHEMA[key]

    // Check flag
    if (options[schema.flagKey]) {
      return {
        value: options[schema.flagKey],
        source: 'flag',
        sourceName: 'flag',
      }
    }

    // Check environment
    const envValue = process.env[schema.envVar]
    if (envValue) {
      return {
        value: envValue,
        source: 'env',
        sourceName: schema.envVar,
      }
    }

    // Check config file
    const configValue = this.configFile[schema.configKey]
    if (configValue) {
      return {
        value: configValue,
        source: 'config',
        sourceName: this.configFilePath,
      }
    }

    // Use default
    if (schema.defaultValue) {
      return {
        value: schema.defaultValue,
        source: 'default',
        sourceName: 'default',
      }
    }

    // Not set
    return {
      value: undefined,
      source: 'none',
      sourceName: 'none',
    }
  }

  resolveAll(options: Record<string, unknown> = {}) {
    const api_key = this.resolveValue('api_key', options)
    const api_base_url = this.resolveValue('api_base_url', options)
    const app_base_url = this.resolveValue('app_base_url', options)

    return {
      api_key,
      api_base_url,
      app_base_url,
      contact_channel: buildContactChannel(options, this.configFile),
    }
  }

  // Legacy compatibility
  resolveFullConfig(options: Record<string, unknown> = {}) {
    const resolved = this.resolveAll(options)
    return {
      api_key: resolved.api_key.value,
      api_base_url: resolved.api_base_url.value!,
      app_base_url: resolved.app_base_url.value!,
      contact_channel: resolved.contact_channel,
    }
  }
}

export function loadConfigFile(configFile?: string): ConfigFile {
  return new ConfigResolver({ configFile }).configFile
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildContactChannel(options: any, config: ConfigFile) {
  // Priority: CLI flags > env vars > config file

  const channel = config.channel || {}

  const slackChannelId =
    options.slackChannel ||
    process.env.HUMANLAYER_SLACK_CHANNEL ||
    channel.slack?.channel_or_user_id ||
    ''

  const slackBotToken =
    options.slackBotToken || process.env.HUMANLAYER_SLACK_BOT_TOKEN || channel.slack?.bot_token

  const slackContext =
    options.slackContext ||
    process.env.HUMANLAYER_SLACK_CONTEXT ||
    channel.slack?.context_about_channel_or_user

  const slackThreadTs =
    options.slackThreadTs || process.env.HUMANLAYER_SLACK_THREAD_TS || channel.slack?.thread_ts

  const slackBlocks =
    options.slackBlocks !== undefined
      ? options.slackBlocks
      : process.env.HUMANLAYER_SLACK_BLOCKS === 'true' ||
        channel.slack?.experimental_slack_blocks ||
        true

  const emailAddress =
    options.emailAddress || process.env.HUMANLAYER_EMAIL_ADDRESS || channel.email?.address

  const emailContext =
    options.emailContext || process.env.HUMANLAYER_EMAIL_CONTEXT || channel.email?.context_about_user

  const contactChannel: ContactChannel = {}

  if (slackChannelId || slackBotToken) {
    contactChannel.slack = {
      channel_or_user_id: slackChannelId,
      experimental_slack_blocks: slackBlocks,
    }

    if (slackBotToken) contactChannel.slack.bot_token = slackBotToken
    if (slackContext) contactChannel.slack.context_about_channel_or_user = slackContext
    if (slackThreadTs) contactChannel.slack.thread_ts = slackThreadTs
  }

  if (emailAddress) {
    contactChannel.email = {
      address: emailAddress,
    }

    if (emailContext) contactChannel.email.context_about_user = emailContext
  }

  return contactChannel
}

export function saveConfigFile(config: ConfigFile, configFile?: string): void {
  const configPath = configFile || getDefaultConfigPath()

  console.log(chalk.yellow(`Writing config to ${configPath}`))

  // Create directory if it doesn't exist
  const configDir = path.dirname(configPath)
  fs.mkdirSync(configDir, { recursive: true })

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  console.log(chalk.green('Config saved successfully'))
}

export function getDefaultConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config')
  return path.join(xdgConfigHome, 'humanlayer', 'humanlayer.json')
}

export type ResolvedConfig = {
  api_key?: string
  api_base_url: string
  app_base_url: string
  contact_channel: ContactChannel
}

export type ConfigWithSources = {
  api_key?: ConfigValue<string | undefined>
  api_base_url: ConfigValue<string>
  app_base_url: ConfigValue<string>
  contact_channel: ContactChannel
}

// Legacy compatibility functions
export function resolveConfigWithSources(options: Record<string, unknown> = {}): ConfigWithSources {
  const resolver = new ConfigResolver(options)
  const resolved = resolver.resolveAll(options)

  return {
    api_key: resolved.api_key,
    api_base_url: resolved.api_base_url as ConfigValue<string>,
    app_base_url: resolved.app_base_url as ConfigValue<string>,
    contact_channel: resolved.contact_channel,
  }
}

export function resolveFullConfig(options: Record<string, unknown> = {}): ResolvedConfig {
  const resolver = new ConfigResolver(options)
  return resolver.resolveFullConfig(options)
}

// Utility function for masking sensitive values consistently
export function maskSensitiveValue(value: string | undefined): string {
  if (!value) {
    return '<not set>'
  }

  if (value.length <= 6) {
    return value + '...'
  }

  return value.substring(0, 6) + '...'
}
