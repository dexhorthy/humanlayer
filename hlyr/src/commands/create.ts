import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import chalk from 'chalk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface CreateOptions {
  // Future: could add --template typescript|python option
  template?: string
}

function substituteTemplate(content: string, projectName: string): string {
  return content.replace(/\{\{PROJECT_NAME\}\}/g, projectName)
}

function detectBamlVersion(targetDir: string): string | undefined {
  try {
    const packageLockPath = join(targetDir, 'package-lock.json')
    if (existsSync(packageLockPath)) {
      const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'))
      const bamlPackage = packageLock.packages?.['node_modules/@boundaryml/baml']
      if (bamlPackage?.version) {
        return bamlPackage.version
      }
    }
    
    // Fallback: try to get version from node_modules directly
    const bamlPackagePath = join(targetDir, 'node_modules/@boundaryml/baml/package.json')
    if (existsSync(bamlPackagePath)) {
      const bamlPkg = JSON.parse(readFileSync(bamlPackagePath, 'utf8'))
      return bamlPkg.version
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not detect BAML version, using default'))
  }
  
  return undefined
}

function copyTemplate(templateDir: string, targetDir: string, projectName: string): void {
  const items = readdirSync(templateDir)

  for (const item of items) {
    const templatePath = join(templateDir, item)
    const targetPath = join(targetDir, item)
    const stat = statSync(templatePath)

    if (stat.isDirectory()) {
      // Skip node_modules and other build artifacts
      if (item === 'node_modules' || item === 'dist' || item === 'baml_client') {
        continue
      }
      mkdirSync(targetPath, { recursive: true })
      copyTemplate(templatePath, targetPath, projectName)
    } else {
      // Skip package-lock.json - let npm install regenerate it
      if (item === 'package-lock.json') {
        continue
      }

      const content = readFileSync(templatePath, 'utf8')
      const processedContent = substituteTemplate(content, projectName)
      writeFileSync(targetPath, processedContent)
    }
  }
}

function runCommand(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log(chalk.gray(`Running: ${command} ${args.join(' ')}`))

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    })

    child.on('close', code => {
      if (code === 0) {
        resolve(code)
      } else {
        reject(new Error(`Command failed with exit code ${code}`))
      }
    })

    child.on('error', error => {
      reject(error)
    })
  })
}

export async function createCommand(projectName: string, _options: CreateOptions): Promise<void> {
  console.log(chalk.blue(`Creating new 12-factor agent project: ${projectName}`))

  // Determine target directory
  const isCurrentDir = projectName === '.'
  const targetDir = isCurrentDir ? process.cwd() : resolve(process.cwd(), projectName)
  const actualProjectName = isCurrentDir
    ? dirname(targetDir).split('/').pop() || 'my-agent'
    : projectName

  console.log(chalk.gray(`Target directory: ${targetDir}`))
  console.log(chalk.gray(`Project name: ${actualProjectName}`))

  // Check for conflicts
  if (!isCurrentDir) {
    if (existsSync(targetDir)) {
      console.error(chalk.red(`Error: Directory ${projectName} already exists`))
      process.exit(1)
    }
    mkdirSync(targetDir, { recursive: true })
  } else {
    // Check if current directory has conflicting files
    const conflictingFiles = ['package.json', 'tsconfig.json', 'src']
    const conflicts = conflictingFiles.filter(file => existsSync(join(targetDir, file)))

    if (conflicts.length > 0) {
      console.error(
        chalk.red(`Error: Current directory contains conflicting files: ${conflicts.join(', ')}`),
      )
      console.error(
        chalk.red('Please run this command in an empty directory or specify a new directory name'),
      )
      process.exit(1)
    }
  }

  // Find template directory
  // In development, templates are in hlyr/templates/
  // In production, they should be in node_modules/humanlayer/templates/
  const devTemplatePath = join(__dirname, '../../templates/typescript')
  const prodTemplatePath = join(__dirname, '../templates/typescript')

  let templateDir: string
  if (existsSync(devTemplatePath)) {
    templateDir = devTemplatePath
  } else if (existsSync(prodTemplatePath)) {
    templateDir = prodTemplatePath
  } else {
    console.error(chalk.red('Error: Could not find TypeScript template'))
    console.error(chalk.gray('Template paths checked:'))
    console.error(chalk.gray(`  ${devTemplatePath}`))
    console.error(chalk.gray(`  ${prodTemplatePath}`))
    process.exit(1)
  }

  console.log(chalk.gray(`Using template: ${templateDir}`))

  try {
    // Copy template files (without BAML version substitution yet)
    console.log(chalk.blue('📁 Copying template files...'))
    copyTemplate(templateDir, targetDir, actualProjectName)

    // Install dependencies
    console.log(chalk.blue('📦 Installing dependencies...'))
    await runCommand('npm', ['install'], targetDir)

    // Detect BAML version and update generators.baml
    console.log(chalk.blue('🔧 Configuring BAML version...'))
    const bamlVersion = detectBamlVersion(targetDir)
    if (bamlVersion) {
      console.log(chalk.gray(`  Detected BAML version: ${bamlVersion}`))
      const generatorsPath = join(targetDir, 'baml_src/generators.baml')
      if (existsSync(generatorsPath)) {
        const content = readFileSync(generatorsPath, 'utf8')
        const updatedContent = content.replace(/\{\{BAML_VERSION\}\}/g, bamlVersion)
        writeFileSync(generatorsPath, updatedContent)
      }
    } else {
      console.log(chalk.yellow('⚠️  Could not detect BAML version, using default 0.90.0'))
      const generatorsPath = join(targetDir, 'baml_src/generators.baml')
      if (existsSync(generatorsPath)) {
        const content = readFileSync(generatorsPath, 'utf8')
        const updatedContent = content.replace(/\{\{BAML_VERSION\}\}/g, '0.90.0')
        writeFileSync(generatorsPath, updatedContent)
      }
    }

    // Generate BAML client
    console.log(chalk.blue('🧠 Generating BAML client...'))
    await runCommand('npx', ['baml-cli', 'generate'], targetDir)

    // Success!
    console.log(chalk.green('✅ Project created successfully!'))
    console.log()
    console.log(chalk.yellow('Next steps:'))

    if (!isCurrentDir) {
      console.log(chalk.gray(`  cd ${projectName}`))
    }

    console.log(chalk.gray('  export OPENAI_API_KEY=your_openai_key_here'))
    console.log(chalk.gray('  export HUMANLAYER_API_KEY=your_humanlayer_key_here'))
    console.log(chalk.gray('  npx tsx src/index.ts "what is 3 + 4"'))
    console.log()
    console.log(chalk.blue('📖 Learn more:'))
    console.log(chalk.gray('  https://humanlayer.dev/docs'))
    console.log(chalk.gray('  https://github.com/humanlayer/12-factor-agents'))
  } catch (error) {
    console.error(chalk.red('❌ Failed to create project:'), error)
    process.exit(1)
  }
}
