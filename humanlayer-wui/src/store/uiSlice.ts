import type { StateCreator } from 'zustand'

export interface UISlice {
  loading: boolean
  error: string | null
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  loading: false,
  error: null,
  
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
})