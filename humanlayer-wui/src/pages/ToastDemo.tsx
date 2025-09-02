import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeSelector } from '@/components/ThemeSelector'
import { toast, Toaster } from 'sonner'

interface ApprovalNotification {
  sessionTitle: string
  toolName: string
  toolArgs: Record<string, any>
}

const DEFAULT_NOTIFICATION: ApprovalNotification = {
  sessionTitle: '/create_plan 1921',
  toolName: 'Write',
  toolArgs: {
    filename: 'src/components/Auth/LoginForm.tsx',
    contents: 'foo bar baz',
  },
}

const PRESET_NOTIFICATIONS = {
  writeFile: {
    sessionTitle: 'Fix layout component styling',
    toolName: 'Write',
    toolArgs: {
      filename: 'src/components/Layout/Header.tsx',
      contents: 'const Header = () => { return <header>...</header> }',
    },
  },
  editFile: {
    sessionTitle: 'Update API endpoints',
    toolName: 'Edit',
    toolArgs: {
      file_path: 'src/services/api/endpoints.ts',
      old_string: 'http://localhost:3000',
      new_string: 'https://api.production.com',
    },
  },
  bashCommand: {
    sessionTitle: 'Install dependencies',
    toolName: 'Bash',
    toolArgs: {
      command: 'npm install @tanstack/react-query axios',
      description: 'Install React Query and Axios',
    },
  },
  multiEdit: {
    sessionTitle: 'Refactor authentication module',
    toolName: 'MultiEdit',
    toolArgs: {
      file_path: 'src/auth/login.ts',
      edits: [
        { old_string: 'localStorage', new_string: 'sessionStorage' },
        { old_string: 'token', new_string: 'authToken' },
      ],
    },
  },
  grep: {
    sessionTitle: 'Search for TODO comments',
    toolName: 'Grep',
    toolArgs: {
      pattern: 'TODO|FIXME|HACK',
      path: 'src/',
      output_mode: 'files_with_matches',
    },
  },
  read: {
    sessionTitle: 'Analyze configuration',
    toolName: 'Read',
    toolArgs: {
      file_path: '/Users/project/config/settings.json',
      offset: 0,
      limit: 100,
    },
  },
}

// Helper to truncate text from left (show the end)
const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return '...' + text.slice(-(maxLength - 3))
}

// Helper to truncate from right (for file paths)
const truncateRight = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  const lastSlash = text.lastIndexOf('/')
  if (lastSlash !== -1) {
    const filename = text.slice(lastSlash + 1)
    if (filename.length <= maxLength) {
      return '...' + text.slice(-maxLength)
    }
  }
  return '...' + text.slice(-(maxLength - 3))
}

export default function ToastDemo() {
  const [jsonInput, setJsonInput] = useState(JSON.stringify(DEFAULT_NOTIFICATION, null, 2))

  const fireNotification = () => {
    try {
      const data: ApprovalNotification = JSON.parse(jsonInput)

      // Extract the most relevant arg to display from toolArgs object
      let displayArg = ''
      if (typeof data.toolArgs === 'object' && data.toolArgs !== null) {
        // Priority order for different tools
        if (data.toolArgs.file_path) {
          displayArg = data.toolArgs.file_path
        } else if (data.toolArgs.filename) {
          displayArg = data.toolArgs.filename
        } else if (data.toolArgs.command) {
          displayArg = data.toolArgs.command
        } else if (data.toolArgs.pattern) {
          displayArg = data.toolArgs.pattern
        } else if (data.toolArgs.path) {
          displayArg = data.toolArgs.path
        } else if (data.toolArgs.url) {
          displayArg = data.toolArgs.url
        } else if (data.toolArgs.query) {
          displayArg = data.toolArgs.query
        } else {
          // Fallback: show first string value or first key
          const firstValue = Object.values(data.toolArgs).find(v => typeof v === 'string')
          displayArg = firstValue || Object.keys(data.toolArgs)[0] || ''
        }
      } else if (typeof data.toolArgs === 'string') {
        // Handle legacy string format
        displayArg = data.toolArgs
      }

      // Calculate max arg length based on tool name length
      const maxArgLength = Math.max(10, 35 - data.toolName.length)
      const truncatedArgs = truncateRight(String(displayArg), maxArgLength)
      const truncatedTitle = truncate(data.sessionTitle, 30)

      toast(
        <span style={{ color: 'var(--terminal-warning)', fontWeight: 'bold' }}>NEEDS_APPROVAL</span>,
        {
          description: `${truncatedTitle}\n${data.toolName}(${truncatedArgs})`,
          duration: Infinity,
          action: {
            label: 'Jump to Session',
            onClick: () => {
              toast.success('Navigated to session')
            },
          },
        },
      )
    } catch (error) {
      toast.error('Invalid JSON', {
        description: error instanceof Error ? error.message : 'Failed to parse JSON input',
      })
    }
  }

  const setPreset = (preset: ApprovalNotification) => {
    setJsonInput(JSON.stringify(preset, null, 2))
  }

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Approval Notification Tester</h1>
          <p className="text-muted-foreground">
            Test NEEDS_APPROVAL notifications with realistic tool inputs
          </p>
        </div>

        <div className="flex justify-center items-center gap-4">
          <span className="text-sm text-muted-foreground">Theme:</span>
          <ThemeSelector />
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Configuration</CardTitle>
              <CardDescription>Edit the JSON to customize the notification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Notification JSON</label>
                <textarea
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  className="w-full h-48 p-3 font-mono text-sm bg-secondary/30 border border-border rounded-none resize-none"
                  placeholder="Enter notification JSON..."
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={fireNotification} className="flex-1">
                  Fire Notification
                </Button>
                <Button onClick={() => toast.dismiss()} variant="secondary">
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preset Scenarios</CardTitle>
              <CardDescription>Click to load common tool call scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Button variant="outline" onClick={() => setPreset(PRESET_NOTIFICATIONS.writeFile)}>
                  Write File
                </Button>
                <Button variant="outline" onClick={() => setPreset(PRESET_NOTIFICATIONS.editFile)}>
                  Edit File
                </Button>
                <Button variant="outline" onClick={() => setPreset(PRESET_NOTIFICATIONS.bashCommand)}>
                  Bash Command
                </Button>
                <Button variant="outline" onClick={() => setPreset(PRESET_NOTIFICATIONS.multiEdit)}>
                  Multi Edit
                </Button>
                <Button variant="outline" onClick={() => setPreset(PRESET_NOTIFICATIONS.grep)}>
                  Grep Search
                </Button>
                <Button variant="outline" onClick={() => setPreset(PRESET_NOTIFICATIONS.read)}>
                  Read File
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Toaster component for displaying toasts */}
      <Toaster position="top-right" richColors />
    </div>
  )
}
