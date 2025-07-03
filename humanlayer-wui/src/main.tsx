import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ThemeProvider } from './contexts/ThemeContext'
import { HotkeysProvider } from 'react-hotkeys-hook'
import { StoreProvider } from './store/StoreProvider'

const isDemo = window.location.search.includes('demo=true')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider demo={isDemo}>
      <ThemeProvider>
        <HotkeysProvider>
          <RouterProvider router={router} />
        </HotkeysProvider>
      </ThemeProvider>
    </StoreProvider>
  </React.StrictMode>,
)
