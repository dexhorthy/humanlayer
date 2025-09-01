import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeSelector } from '@/components/ThemeSelector'
import { toast, Toaster } from 'sonner'

// Helper function to truncate text
const truncate = (text: string, maxLength: number) => {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}

export default function ToastDemo() {
  const showSuccessToasts = () => {
    toast.success('Session completed successfully')
    setTimeout(() => {
      toast.success('Model updated', {
        description: 'Claude 3.5 Sonnet is now active for all new messages',
      })
    }, 300)
    setTimeout(() => {
      toast.success('Directory added', {
        description: 'Will apply at next message',
      })
    }, 600)
    setTimeout(() => {
      toast.success('Copied to clipboard')
    }, 900)
  }

  const showErrorToasts = () => {
    toast.error('Session failed')
    setTimeout(() => {
      toast.error('Failed to update model', {
        description: 'OpenRouter API key is required for custom models',
      })
    }, 300)
    setTimeout(() => {
      toast.error('Failed to copy to clipboard', {
        description: 'Clipboard access was denied by browser security policy',
      })
    }, 600)
    setTimeout(() => {
      toast.error('Failed to check configuration')
    }, 900)
  }

  const showInfoToasts = () => {
    toast.info('Advanced Providers Disabled', {
      description: 'Only Anthropic models will be available in the model selector',
    })
    setTimeout(() => {
      toast.info('Bypass permissions expired', {
        description: 'Auto-accept mode has been disabled for security',
      })
    }, 300)
    setTimeout(() => {
      toast.info('Session archived', {
        description: 'Moved to archived sessions list',
      })
    }, 600)
  }

  const showWarningToasts = () => {
    toast.warning('Press e again to archive active session', {
      description: 'This will move the session to your archived list',
    })
    setTimeout(() => {
      toast.warning('Auto-accept mode enabled', {
        description: 'All tool calls will be automatically approved for 5 minutes',
      })
    }, 300)
    setTimeout(() => {
      toast.warning('Dangerous permissions bypassed', {
        description: 'File system access restrictions have been temporarily lifted',
      })
    }, 600)
  }

  const showLoadingToasts = () => {
    const loadingToast = toast.loading('Connecting to session...')
    setTimeout(() => {
      toast.success('Connected to session ENG-1234', { id: loadingToast })
    }, 2000)

    setTimeout(() => {
      const modelToast = toast.loading('Updating model configuration...')
      setTimeout(() => {
        toast.success('Model updated to GPT-4', { id: modelToast })
      }, 1500)
    }, 300)
  }

  const showApprovalToasts = () => {
    toast('NEEDS_APPROVAL', {
      description: `${truncate('Implement user authentication', 30)}\nWrite(...components/Auth/LoginForm.tsx)`,
      duration: Infinity,
      action: {
        label: 'Jump to Session',
        onClick: () => {
          toast.success('Navigated to session')
        },
      },
    })

    setTimeout(() => {
      toast('NEEDS_APPROVAL', {
        description: `${truncate('Install dependencies for project', 30)}\nBash(npm install @tanstack/react-query)`,
        duration: Infinity,
        action: {
          label: 'Jump to Session', 
          onClick: () => {
            toast.success('Navigated to session')
          },
        },
      })
    }, 400)
  }

  const showReadyForInputToasts = () => {
    toast('READY_FOR_INPUT', {
      description: `${truncate('Implement user authentication', 30)}\nAwaiting next message`,
      duration: Infinity,
      action: {
        label: 'Jump to Session',
        onClick: () => {
          toast.success('Navigated to session')
        },
      },
    })

    setTimeout(() => {
      toast('READY_FOR_INPUT', {
        description: `${truncate('Fix database connection issues', 30)}\nAwaiting next message`,
        duration: Infinity,
        action: {
          label: 'Jump to Session',
          onClick: () => {
            toast.success('Navigated to session')
          },
        },
      })
    }, 400)
  }

  const showMixedToasts = () => {
    toast.success('Session launched')
    setTimeout(() => toast.error('Connection timeout'), 200)
    setTimeout(() => toast.info('Retrying connection...'), 400)
    setTimeout(() => toast.warning('Using fallback model'), 600)
    setTimeout(() => toast.success('Connected successfully'), 800)
  }

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Toast Demo</h1>
          <p className="text-muted-foreground">
            Terminal-styled toast notifications with realistic HumanLayer WUI examples
          </p>
        </div>

        <div className="flex justify-center items-center gap-4">
          <span className="text-sm text-muted-foreground">Theme:</span>
          <ThemeSelector />
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Success Toasts</CardTitle>
              <CardDescription>Positive feedback messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Button onClick={() => toast.success('Session completed successfully')}>
                  Session Complete
                </Button>
                <Button onClick={() => toast.success('Model updated')}>
                  Model Updated
                </Button>
                <Button onClick={() => toast.success('Copied to clipboard')}>
                  Copied Text
                </Button>
                <Button onClick={() => toast.success('Directory added', { description: 'Will apply at next message' })}>
                  Directory Added
                </Button>
                <Button onClick={() => toast.success('Session unarchived', { description: 'Moved back to active sessions' })}>
                  Session Unarchived
                </Button>
                <Button onClick={showSuccessToasts}>
                  Multiple Success
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error Toasts</CardTitle>
              <CardDescription>Error and failure messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Button variant="destructive" onClick={() => toast.error('Session failed')}>
                  Session Failed
                </Button>
                <Button variant="destructive" onClick={() => toast.error('Failed to update model')}>
                  Model Error
                </Button>
                <Button variant="destructive" onClick={() => toast.error('Failed to copy to clipboard')}>
                  Clipboard Error
                </Button>
                <Button variant="destructive" onClick={() => toast.error('Failed to check configuration', { description: 'Network connection required' })}>
                  Config Error
                </Button>
                <Button variant="destructive" onClick={() => toast.error('Failed to archive session', { description: 'Session is currently active' })}>
                  Archive Error
                </Button>
                <Button variant="destructive" onClick={showErrorToasts}>
                  Multiple Errors
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Info Toasts</CardTitle>
              <CardDescription>Informational messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Button variant="outline" onClick={() => toast.info('Advanced Providers Disabled')}>
                  Providers Disabled
                </Button>
                <Button variant="outline" onClick={() => toast.info('Session archived', { description: 'Moved to archived sessions list' })}>
                  Session Archived
                </Button>
                <Button variant="outline" onClick={() => toast.info('Bypass permissions expired')}>
                  Permissions Expired
                </Button>
                <Button variant="outline" onClick={() => toast.info('Model change will apply at next message')}>
                  Model Pending
                </Button>
                <Button variant="outline" onClick={() => toast.info('Directory removed', { description: 'Will apply at next message' })}>
                  Directory Removed
                </Button>
                <Button variant="outline" onClick={showInfoToasts}>
                  Multiple Info
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Warning Toasts</CardTitle>
              <CardDescription>Warning and caution messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Button onClick={() => toast.warning('Press e again to archive active session')}>
                  Archive Warning
                </Button>
                <Button onClick={() => toast.warning('Auto-accept mode enabled', { description: 'All tool calls will be automatically approved for 5 minutes' })}>
                  Auto-Accept Enabled
                </Button>
                <Button onClick={() => toast.warning('Dangerous permissions bypassed')}>
                  Permissions Bypassed
                </Button>
                <Button onClick={() => toast.warning('Session is currently active', { description: 'Stop session before archiving' })}>
                  Active Session
                </Button>
                <Button onClick={() => toast.warning('Model not configured', { description: 'Using default Claude 3.5 Sonnet' })}>
                  Model Fallback
                </Button>
                <Button onClick={showWarningToasts}>
                  Multiple Warnings
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Loading & Promise Toasts</CardTitle>
              <CardDescription>Loading states and async operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Button onClick={() => {
                  const id = toast.loading('Connecting to session...')
                  setTimeout(() => toast.success('Connected to session ENG-1234', { id }), 2000)
                }}>
                  Session Connection
                </Button>
                <Button onClick={() => {
                  const id = toast.loading('Updating model...')
                  setTimeout(() => toast.success('Model updated to GPT-4', { id }), 1500)
                }}>
                  Model Update
                </Button>
                <Button onClick={() => {
                  const id = toast.loading('Archiving session...')
                  setTimeout(() => toast.success('Session archived', { id }), 1000)
                }}>
                  Archive Session
                </Button>
                <Button onClick={() => {
                  const id = toast.loading('Checking configuration...')
                  setTimeout(() => toast.error('Configuration invalid', { id }), 1500)
                }}>
                  Config Check
                </Button>
                <Button onClick={() => {
                  const id = toast.loading('Launching new session...')
                  setTimeout(() => toast.success('Session launched: ENG-2567', { id }), 2500)
                }}>
                  Launch Session
                </Button>
                <Button onClick={showLoadingToasts}>
                  Multiple Loading
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approval & Ready for Input Toasts</CardTitle>
              <CardDescription>Interactive notifications for approvals and ready states (persistent)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Button onClick={() => toast('NEEDS_APPROVAL', {
                  description: `${truncate('Fix layout component styling', 30)}\nEdit(...components/Layout/Header.tsx)`,
                  duration: Infinity,
                  action: { label: 'Jump to Session', onClick: () => toast.success('Navigated to session') }
                })}>
                  File Write Approval
                </Button>
                <Button onClick={() => toast('NEEDS_APPROVAL', {
                  description: `${truncate('Add React Query to project', 30)}\nBash(npm install react-query axios)`,
                  duration: Infinity,
                  action: { label: 'Jump to Session', onClick: () => toast.success('Navigated to session') }
                })}>
                  Shell Command Approval
                </Button>
                <Button onClick={() => toast('READY_FOR_INPUT', {
                  description: `${truncate('Refactor authentication module', 30)}\nAwaiting next message`,
                  duration: Infinity,
                  action: { label: 'Jump to Session', onClick: () => toast.success('Navigated to session') }
                })}>
                  Ready for Input
                </Button>
                <Button onClick={showApprovalToasts}>
                  Multiple Approvals
                </Button>
                <Button onClick={showReadyForInputToasts}>
                  Multiple Ready States
                </Button>
                <Button onClick={() => {
                  showApprovalToasts()
                  setTimeout(showReadyForInputToasts, 800)
                }}>
                  Mixed Status Toasts
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mixed Scenarios</CardTitle>
              <CardDescription>Realistic usage patterns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button onClick={showMixedToasts}>
                  Session Launch Flow
                </Button>
                <Button onClick={() => {
                  toast.info('Starting session...')
                  setTimeout(() => toast.loading('Configuring environment...'), 200)
                  setTimeout(() => toast.warning('Using fallback configuration'), 1000)
                  setTimeout(() => toast.success('Session ready: ENG-3456'), 1800)
                  setTimeout(() => toast('NEEDS_APPROVAL', {
                    description: `${truncate('Deploy authentication system', 20)}\ngit_push(origin/main)`,
                    duration: Infinity,
                    action: { label: 'Jump to Session', onClick: () => toast.success('Navigated to session') }
                  }), 2200)
                }}>
                  Complete Workflow
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clear Toasts</CardTitle>
              <CardDescription>Management actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => toast.dismiss()}>
                  Clear All Toasts
                </Button>
                <Button variant="ghost" onClick={() => {
                  toast.success('Test toast for clearing', { id: 'test' })
                  setTimeout(() => toast.dismiss('test'), 1000)
                }}>
                  Auto-Clear Demo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>All toasts use the terminal styling with fixed-width font and color-based emphasis.</p>
          <p>Visit different themes to see how the toast colors adapt automatically.</p>
        </div>
      </div>
      
      {/* Toaster component for displaying toasts */}
      <Toaster position="top-right" richColors />
    </div>
  )
}