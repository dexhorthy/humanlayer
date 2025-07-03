import type { SessionInfo } from '@/lib/daemon/types'
import type { StateCreator } from 'zustand'
import { daemonClient } from '@/lib/daemon'

export interface SessionSlice {
  sessions: SessionInfo[]
  focusedSession: SessionInfo | null
  initSessions: (sessions: SessionInfo[]) => void
  updateSession: (sessionId: string, updates: Partial<SessionInfo>) => void
  refreshSessions: () => Promise<void>
  setFocusedSession: (session: SessionInfo | null) => void
  focusNextSession: () => void
  focusPreviousSession: () => void
  interruptSession: (sessionId: string) => Promise<void>
}

export const createSessionSlice: StateCreator<SessionSlice> = (set) => ({
  sessions: [],
  focusedSession: null,
  
  initSessions: (sessions) => set({ sessions }),
  
  updateSession: (sessionId, updates) =>
    set(state => ({
      sessions: state.sessions.map(session =>
        session.id === sessionId ? { ...session, ...updates } : session,
      ),
      focusedSession:
        state.focusedSession?.id === sessionId
          ? { ...state.focusedSession, ...updates }
          : state.focusedSession,
    })),
    
  refreshSessions: async () => {
    try {
      const response = await daemonClient.getSessionLeaves()
      set({ sessions: response.sessions })
    } catch (error) {
      console.error('Failed to refresh sessions:', error)
    }
  },
  
  setFocusedSession: (session) => set({ focusedSession: session }),
  
  focusNextSession: () =>
    set(state => {
      const { sessions, focusedSession } = state
      if (sessions.length === 0) return state

      const currentIndex = focusedSession ? sessions.findIndex(s => s.id === focusedSession.id) : -1

      if (currentIndex === -1 || currentIndex === sessions.length - 1) {
        return { focusedSession: sessions[0] }
      }

      return { focusedSession: sessions[currentIndex + 1] }
    }),
    
  focusPreviousSession: () =>
    set(state => {
      const { sessions, focusedSession } = state
      if (sessions.length === 0) return state

      const currentIndex = focusedSession ? sessions.findIndex(s => s.id === focusedSession.id) : -1

      if (currentIndex === -1 || currentIndex === 0) {
        return { focusedSession: sessions[sessions.length - 1] }
      }

      return { focusedSession: sessions[currentIndex - 1] }
    }),
    
  interruptSession: async (sessionId) => {
    try {
      await daemonClient.interruptSession(sessionId)
    } catch (error) {
      console.error('Failed to interrupt session:', error)
    }
  },
})