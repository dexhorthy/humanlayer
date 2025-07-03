import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { StoreApi, useStore as useZustandStore } from 'zustand'
import { useBoundStore, BoundStore } from './useBoundStore'
import { createDemoStore } from './createDemoStore'

const StoreContext = createContext<StoreApi<BoundStore> | null>(null)

export interface StoreProviderProps {
  children: React.ReactNode
  demo?: boolean
}

export function StoreProvider({ children, demo = false }: StoreProviderProps) {
  const storeRef = useRef<StoreApi<BoundStore>>()
  
  if (!storeRef.current) {
    if (demo) {
      const searchParams = new URLSearchParams(window.location.search)
      const sequence = searchParams.get('sequence') || 'default'
      storeRef.current = createDemoStore(sequence)
    } else {
      storeRef.current = useBoundStore
    }
  }
  
  const store = storeRef.current

  useEffect(() => {
    if (!demo) {
      const unsubscribe = store.subscribe((state) => {
        console.log('[Real Store] Sessions updated:', state.sessions.length, 'Focused:', state.focusedSession?.id)
      })
      
      return unsubscribe
    }
  }, [store, demo])

  return (
    <StoreContext.Provider value={store}>
      {children}
    </StoreContext.Provider>
  )
}

export function useBoundStore<T>(selector: (state: BoundStore) => T): T {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useBoundStore must be used within a StoreProvider')
  return useZustandStore(store, selector)
}