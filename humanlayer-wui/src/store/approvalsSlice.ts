import type { StateCreator } from 'zustand'

export interface ApprovalsSlice {
  notifiedItems: Set<string>
  addNotifiedItem: (notificationId: string) => void
  removeNotifiedItem: (notificationId: string) => void
  isItemNotified: (notificationId: string) => boolean
  clearNotificationsForSession: (sessionId: string) => void
}

export const createApprovalsSlice: StateCreator<ApprovalsSlice> = (set, get) => ({
  notifiedItems: new Set<string>(),
  
  addNotifiedItem: (notificationId) =>
    set(state => ({
      notifiedItems: new Set(state.notifiedItems).add(notificationId),
    })),
    
  removeNotifiedItem: (notificationId) =>
    set(state => {
      const newSet = new Set(state.notifiedItems)
      newSet.delete(notificationId)
      return { notifiedItems: newSet }
    }),
    
  isItemNotified: (notificationId) => {
    return get().notifiedItems.has(notificationId)
  },
  
  clearNotificationsForSession: (sessionId) =>
    set(state => {
      const newSet = new Set<string>()
      state.notifiedItems.forEach(id => {
        if (!id.includes(sessionId)) {
          newSet.add(id)
        }
      })
      return { notifiedItems: newSet }
    }),
})