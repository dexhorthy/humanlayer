import { toast, type ExternalToast } from 'sonner'
import {
  sendNotification,
  isPermissionGranted,
  requestPermission,
} from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { formatError } from '@/utils/errors'
import { logger } from '@/lib/logging'

// Types for generic notification system
export type NotificationType =
  | 'approval_required'
  | 'session_completed'
  | 'session_failed'
  | 'session_started'
  | 'system_alert'
  | 'error'
  | 'settings_changed'

export interface NotificationAction {
  label: string
  onClick: () => void
}

export interface NotificationOptions {
  type: NotificationType
  title: string
  body: string
  metadata: {
    sessionId?: string
    approvalId?: string
    [key: string]: any
  }
  actions?: NotificationAction[]
  duration?: number | null
  priority?: 'low' | 'normal' | 'high'
}

class NotificationService {
  private appFocused: boolean = false // Default to unfocused
  private focusHandler: (() => void) | null = null
  private blurHandler: (() => void) | null = null
  private unlistenFocus: (() => void) | null = null
  private unlistenBlur: (() => void) | null = null

  constructor() {
    logger.log('NotificationService: Constructor called')
    this.attachFocusListeners()
  }

  private validateFocusState() {
    // Force a focus check using document visibility
    if (typeof document !== 'undefined') {
      this.appFocused = document.hasFocus()
    }
  }

  private async attachFocusListeners() {
    logger.log('NotificationService: Attaching focus listeners')

    // Check initial focus state synchronously
    this.validateFocusState()

    // Clean up any existing listeners first
    await this.detachFocusListeners()

    try {
      // Try Tauri window events first
      const appWindow = getCurrentWindow()

      // Listen for focus events
      this.unlistenFocus = await appWindow.onFocusChanged(event => {
        logger.log('Tauri window focus changed:', event)
        this.appFocused = event.payload
      })

      // Also use standard window events as fallback
      this.focusHandler = () => {
        logger.log('window focused (standard event)')
        this.appFocused = true
      }

      this.blurHandler = () => {
        logger.log('window blurred (standard event)')
        this.appFocused = false
      }

      window.addEventListener('focus', this.focusHandler)
      window.addEventListener('blur', this.blurHandler)

      logger.log('NotificationService: Focus listeners attached')
    } catch (error) {
      logger.error('Failed to attach Tauri focus listeners, using standard events only:', error)

      // Fallback to standard events only
      this.focusHandler = () => {
        logger.log('window focused')
        this.appFocused = true
      }

      this.blurHandler = () => {
        logger.log('window blurred')
        this.appFocused = false
      }

      window.addEventListener('focus', this.focusHandler)
      window.addEventListener('blur', this.blurHandler)
    }
  }

  private async detachFocusListeners() {
    logger.log('NotificationService: Detaching focus listeners', {
      hasFocusHandler: !!this.focusHandler,
      hasBlurHandler: !!this.blurHandler,
      hasUnlistenFocus: !!this.unlistenFocus,
    })

    // Remove Tauri listeners
    if (this.unlistenFocus) {
      this.unlistenFocus()
      this.unlistenFocus = null
    }

    if (this.unlistenBlur) {
      this.unlistenBlur()
      this.unlistenBlur = null
    }

    // Remove standard listeners
    if (this.focusHandler) {
      window.removeEventListener('focus', this.focusHandler)
      this.focusHandler = null
    }

    if (this.blurHandler) {
      window.removeEventListener('blur', this.blurHandler)
      this.blurHandler = null
    }
  }

  /**
   * Clean up resources (useful for hot module replacement)
   */
  cleanup() {
    logger.log('NotificationService: Cleanup called')
    this.detachFocusListeners()
  }

  /**
   * Generate a unique notification ID based on type and metadata
   */
  generateNotificationId(type: NotificationType, metadata: Record<string, any>): string {
    const parts: string[] = [type]

    // Add relevant metadata to create unique ID
    if (metadata.sessionId) parts.push(metadata.sessionId)
    if (metadata.approvalId) parts.push(metadata.approvalId)

    // Add any other unique identifiers from metadata
    Object.entries(metadata).forEach(([key, value]) => {
      if (key !== 'sessionId' && key !== 'approvalId' && value) {
        parts.push(String(value))
      }
    })

    return parts.join(':')
  }

  /**
   * Check if user is currently viewing a specific session
   */
  private isViewingSession(sessionId: string): boolean {
    // Get current path from hash
    const currentHash = window.location.hash
    const sessionDetailPattern = /#\/sessions\/([^/]+)/
    const match = currentHash.match(sessionDetailPattern)

    if (match && match[1] === sessionId) {
      return true
    }

    return false
  }

  /**
   * Main entry point for notifications
   */
  async notify(options: NotificationOptions): Promise<string | null> {
    this.validateFocusState() // Ensure focus state is current

    // Generate unique ID for this notification
    const notificationId = this.generateNotificationId(options.type, options.metadata)

    const isViewingSession = options.metadata.sessionId
      ? this.isViewingSession(options.metadata.sessionId)
      : false

    logger.log('NotificationService.notify:', {
      appFocused: this.appFocused,
      notificationType: options.type,
      sessionId: options.metadata.sessionId,
      isViewingSession,
    })

    // If app is blurred, always show OS notification
    if (!this.appFocused) {
      await this.showOSNotification(options)
    }
    // If app is focused but user is viewing the session, skip in-app notification
    else if (isViewingSession) {
      logger.log(`Skipping in-app notification: User is viewing session ${options.metadata.sessionId}`)
      return null
    }
    // Otherwise show in-app notification
    else {
      this.showInAppNotification(options)
    }

    return notificationId
  }

  /**
   * Show in-app notification using Sonner
   */
  private showInAppNotification(options: NotificationOptions) {
    const toastOptions: ExternalToast = {
      closeButton: true, // Always show close button for better UX
      description: options.body,
      duration: options.duration ?? 5000, // Default 5 seconds if undefined
      position: 'top-right', // Position toast at top right corner
    }

    // control notification id when showing an approval (may expand later)
    if (options.type === 'approval_required') {
      toastOptions.id = `${options.type}:${options.metadata.approvalId}`
    }

    // Add primary action if provided
    if (options.actions && options.actions.length > 0) {
      const primaryAction = options.actions[0]
      toastOptions.action = {
        label: primaryAction.label,
        onClick: primaryAction.onClick,
      }
    }

    // Show toast based on type/priority
    switch (options.type) {
      case 'session_failed':
        toast.error(options.title, toastOptions)
        break
      case 'session_completed':
        toast.success(options.title, toastOptions)
        break
      case 'error':
        toast.error(options.title, toastOptions)
        break
      default:
        toast(options.title, toastOptions)
    }
  }

  /**
   * Show OS-level notification using Tauri plugin
   */
  private async showOSNotification(options: NotificationOptions) {
    logger.log('NotificationService.showOSNotification called:', options.title)
    try {
      // Check if we have permission
      let permissionGranted = await isPermissionGranted()
      logger.log('OS notification permission granted:', permissionGranted)

      // Request permission if not granted
      if (!permissionGranted) {
        const permission = await requestPermission()
        permissionGranted = permission === 'granted'
      }

      if (!permissionGranted) {
        logger.warn('Notification permission not granted, falling back to in-app notification')
        this.showInAppNotification(options)
        return
      }

      // Send the notification
      await sendNotification({
        title: options.title,
        body: options.body,
        // We can't directly handle clicks on OS notifications to navigate,
        // but at least the notification will bring attention to the app
      })
    } catch (error) {
      logger.error('Failed to show OS notification:', error)
      // Fallback to in-app notification
      this.showInAppNotification(options)
    }
  }

  /**
   * Convenience method for error notifications
   */
  async notifyError(error: unknown, context?: string): Promise<string | null> {
    // Always log to console for debugging
    logger.error(context || 'Error:', error)

    // Format the error message
    const formattedMessage = formatError(error)

    // Add context if provided
    const body = context ? `${context}: ${formattedMessage}` : formattedMessage

    // Use the existing notify method with error type
    return this.notify({
      type: 'error',
      title: 'Error',
      body,
      metadata: {
        error: error instanceof Error ? error.stack : String(error),
        context: context || '',
        timestamp: new Date().toISOString(),
      },
      duration: 8000, // Errors should be visible longer
      priority: 'high',
    })
  }

  /**
   * Convenience method for approval required notifications
   */
  async notifyApprovalRequired(
    sessionId: string, 
    approvalId: string, 
    toolName: string,
    sessionTitle?: string,
    toolArgs?: string
  ) {
    // Use new concise format for approval notifications
    const title = 'NEEDS_APPROVAL'
    const sessionText = sessionTitle ? this.truncateText(sessionTitle, 30) : `Session ${sessionId.slice(0, 8)}`
    
    // Calculate max arg length based on tool name length
    // Aiming for total line length of ~40 chars
    const maxArgLength = Math.max(10, 35 - toolName.length)
    const argsText = toolArgs ? this.truncateTextRight(toolArgs, maxArgLength) : ''
    const toolCall = `${toolName}(${argsText})`
    const body = `${sessionText}\n${toolCall}`

    return this.notify({
      type: 'approval_required',
      title,
      body,
      metadata: {
        sessionId,
        approvalId,
        toolName,
      },
      duration: Infinity, // Approval notifications should stick until dismissed
      actions: [
        {
          label: 'Jump to Session',
          onClick: () => {
            window.location.hash = `/sessions/${sessionId}`
          },
        },
      ],
    })
  }

  /**
   * Convenience method for ready for input notifications
   */
  async notifyReadyForInput(
    sessionId: string,
    sessionTitle?: string
  ) {
    // Use same format as approval notifications for consistency
    const title = 'READY_FOR_INPUT'
    const sessionText = sessionTitle ? this.truncateText(sessionTitle, 30) : `Session ${sessionId.slice(0, 8)}`
    const body = `${sessionText}\nAwaiting next message`

    return this.notify({
      type: 'approval_required', // Use same type for consistent styling
      title,
      body,
      metadata: {
        sessionId,
      },
      duration: Infinity, // Should stick until dismissed
      actions: [
        {
          label: 'Jump to Session',
          onClick: () => {
            window.location.hash = `/sessions/${sessionId}`
          },
        },
      ],
    })
  }

  /**
   * Truncate text from the left to show the end
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return '...' + text.slice(-(maxLength - 3))
  }

  /**
   * Truncate text from the left to show the end (useful for file paths)
   */
  private truncateTextRight(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    // For file paths, try to preserve the filename
    const lastSlash = text.lastIndexOf('/')
    if (lastSlash !== -1) {
      const filename = text.slice(lastSlash + 1)
      if (filename.length <= maxLength) {
        // If filename fits, show partial path + filename
        const remainingSpace = maxLength - filename.length - 3 // -3 for "..."
        if (remainingSpace > 0) {
          return '...' + text.slice(-(maxLength))
        }
      }
    }
    // Otherwise just show the end
    return '...' + text.slice(-(maxLength - 3))
  }


  /**
   * Get current focus state
   */
  isAppFocused(): boolean {
    return this.appFocused
  }

  /**
   * Clear notification by approvalId
   */

  clearNotificationByApprovalId(approvalId: string) {
    const matchingToasts = toast
      .getToasts()
      .filter(toast => toast.id === `approval_required:${approvalId}`)

    logger.log('clearNotificationByApprovalId', matchingToasts)
    matchingToasts.forEach(toDismiss => toast.dismiss(toDismiss.id))
  }
}

// Export singleton instance with HMR support
let notificationService: NotificationService

// Clean up previous instance on hot reload
if (import.meta.hot) {
  logger.log('NotificationService: HMR detected, checking for previous instance')
  if ((import.meta as any).hot.data.notificationService) {
    logger.log('NotificationService: Cleaning up previous instance')
    ;(import.meta as any).hot.data.notificationService.cleanup()
  }
}

logger.log('NotificationService: Creating new instance')
notificationService = new NotificationService()

// Store instance for cleanup on next hot reload
if (import.meta.hot) {
  logger.log('NotificationService: Storing instance for future cleanup')
  ;(import.meta as any).hot.data.notificationService = notificationService
}

export { notificationService }
