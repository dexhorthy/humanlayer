import { useState, useEffect } from 'react'
import { useTheme, type Theme } from '@/contexts/ThemeContext'

const themes: { value: Theme; label: string; icon: string }[] = [
  { value: 'solarized-dark', label: 'Solarized Dark', icon: '◐' },
  { value: 'solarized-light', label: 'Solarized Light', icon: '◯' },
  { value: 'cappuccino', label: 'Cappuccino', icon: '☕' },
  { value: 'catppuccin', label: 'Catppuccin', icon: '🐱' },
  { value: 'high-contrast', label: 'High Contrast', icon: '●' },
]

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const currentTheme = themes.find(t => t.value === theme)

  // Update selected index when theme changes or dropdown opens
  useEffect(() => {
    const currentIndex = themes.findIndex(t => t.value === theme)
    if (currentIndex !== -1) {
      setSelectedIndex(currentIndex)
    }
  }, [theme, isOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+T to toggle dropdown
      if (event.ctrlKey && event.key === 't') {
        event.preventDefault()
        setIsOpen(prev => !prev)
        return
      }

      // Only handle navigation when dropdown is open
      if (!isOpen) return

      switch (event.key) {
        case 'ArrowDown':
        case 'j':
          event.preventDefault()
          setSelectedIndex(prev => (prev + 1) % themes.length)
          break
        case 'ArrowUp':
        case 'k':
          event.preventDefault()
          setSelectedIndex(prev => (prev - 1 + themes.length) % themes.length)
          break
        case 'Enter':
          event.preventDefault()
          setTheme(themes[selectedIndex].value)
          setIsOpen(false)
          break
        case 'Escape':
          event.preventDefault()
          setIsOpen(false)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, setTheme])

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-1.5 py-0.5 text-xs font-mono border border-border bg-background text-foreground hover:bg-accent/10 transition-colors"
        title={`Theme: ${currentTheme?.label || 'Unknown'}`}
      >
        {currentTheme?.icon || '⚙'}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full right-0 mb-1 min-w-28 border border-border bg-background z-20">
            {themes.map((themeOption, index) => (
              <button
                key={themeOption.value}
                onClick={() => {
                  setTheme(themeOption.value)
                  setIsOpen(false)
                }}
                className={`w-full px-2 py-1.5 text-left text-xs font-mono transition-colors flex items-center gap-2 ${
                  index === selectedIndex
                    ? 'bg-accent/20 text-accent'
                    : theme === themeOption.value
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground hover:bg-accent/5'
                }`}
              >
                <span>{themeOption.icon}</span>
                <span>{themeOption.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
