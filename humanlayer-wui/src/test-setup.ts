import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Extend window interface for Tauri
declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: typeof vi.fn
    }
  }
}

// Mock window object for tests
if (typeof window !== 'undefined') {
  // Mock Tauri internals
  window.__TAURI_INTERNALS__ = {
    invoke: vi.fn(),
  }
}

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))
