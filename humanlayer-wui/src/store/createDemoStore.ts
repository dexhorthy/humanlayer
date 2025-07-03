import { create, StoreApi } from 'zustand'
import type { BoundStore } from './useBoundStore'
import type { SessionInfo } from '@/lib/daemon/types'
import { SessionStatus } from '@/lib/daemon/types'

interface DemoSequenceStep {
  state: Partial<BoundStore>
  delay: number
}

class DemoAnimator {
  private store: StoreApi<BoundStore>
  private sequence: DemoSequenceStep[]
  private currentIndex: number = 0
  private timeoutId: NodeJS.Timeout | null = null
  private isRunning: boolean = false
  
  constructor(store: StoreApi<BoundStore>, sequence: DemoSequenceStep[]) {
    this.store = store
    this.sequence = sequence
  }
  
  start() {
    this.isRunning = true
    this.currentIndex = 0
    this.playNext()
  }
  
  stop() {
    this.isRunning = false
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }
  
  private playNext() {
    if (!this.isRunning || this.currentIndex >= this.sequence.length) {
      if (this.isRunning) {
        this.currentIndex = 0
        this.playNext()
      }
      return
    }
    
    const step = this.sequence[this.currentIndex]
    
    this.timeoutId = setTimeout(() => {
      this.store.setState(step.state as BoundStore)
      this.currentIndex++
      this.playNext()
    }, step.delay)
  }
}

const mockSessions: SessionInfo[] = [
  {
    id: 'demo-session-1',
    run_id: 'demo-run-1',
    status: SessionStatus.Running,
    query: 'Help me refactor the authentication module',
    model: 'claude-3-sonnet',
    start_time: new Date(Date.now() - 3600000).toISOString(),
    end_time: undefined,
    conversation: [],
    tool_calls: [],
    approvals: [],
  },
  {
    id: 'demo-session-2',
    run_id: 'demo-run-2',
    status: SessionStatus.Completed,
    query: 'Add unit tests for the payment processor',
    model: 'claude-3-opus',
    start_time: new Date(Date.now() - 7200000).toISOString(),
    end_time: new Date(Date.now() - 3600000).toISOString(),
    conversation: [],
    tool_calls: [],
    approvals: [],
  },
]

const demoSequences: Record<string, DemoSequenceStep[]> = {
  default: [
    { state: { sessions: [], loading: true }, delay: 1000 },
    { state: { sessions: mockSessions, loading: false }, delay: 2000 },
    { state: { focusedSession: mockSessions[0] }, delay: 3000 },
    { state: { focusedSession: mockSessions[1] }, delay: 3000 },
    { state: { focusedSession: null }, delay: 2000 },
  ],
  approvals: [
    { 
      state: { 
        sessions: mockSessions,
        notifiedItems: new Set(['demo-approval-1']),
      }, 
      delay: 2000 
    },
    { 
      state: { 
        notifiedItems: new Set(['demo-approval-1', 'demo-approval-2']),
      }, 
      delay: 3000 
    },
    { 
      state: { 
        notifiedItems: new Set(),
      }, 
      delay: 4000 
    },
  ],
}

export function createDemoStore(sequenceName: string = 'default'): StoreApi<BoundStore> {
  const sequence = demoSequences[sequenceName] || demoSequences.default
  
  const store = create<BoundStore>(() => ({
    // SessionSlice
    sessions: [],
    focusedSession: null,
    initSessions: () => {},
    updateSession: () => {},
    refreshSessions: async () => {},
    setFocusedSession: () => {},
    focusNextSession: () => {},
    focusPreviousSession: () => {},
    interruptSession: async () => {},
    
    // ApprovalsSlice
    notifiedItems: new Set<string>(),
    addNotifiedItem: () => {},
    removeNotifiedItem: () => {},
    isItemNotified: () => false,
    clearNotificationsForSession: () => {},
    
    // UISlice
    loading: false,
    error: null,
    setLoading: () => {},
    setError: () => {},
    clearError: () => {},
  }))
  
  const animator = new DemoAnimator(store, sequence)
  animator.start()
  
  // Store animator reference for cleanup
  (store as any)._animator = animator
  
  return store as unknown as StoreApi<BoundStore>
}