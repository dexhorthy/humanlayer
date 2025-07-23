import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LoadingStates } from './LoadingStates'

describe('LoadingStates', () => {
  beforeEach(() => {
    // Clear any module cache to ensure fresh component instances
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the random verb', () => {
    render(<LoadingStates randomVerb="Generating" />)
    expect(screen.getByText('Generating')).toBeInTheDocument()
  })

  it('renders fancy spinner when random selects type 0', () => {
    // Mock before importing/rendering component
    vi.spyOn(Math, 'random').mockReturnValue(0) // Will select type 0 (fancy)

    const { container } = render(<LoadingStates randomVerb="Testing" />)

    // Check for unique elements of fancy spinner
    expect(container.querySelector('.animate-spin-slow')).toBeInTheDocument()
    expect(container.querySelector('.animate-morph')).toBeInTheDocument()
    expect(container.querySelector('.animate-glitch')).toBeInTheDocument()
  })

  it('renders simple spinner when random selects type 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.34) // Will select type 1 (simple)

    const { container } = render(<LoadingStates randomVerb="Testing" />)

    // Check for unique elements of simple spinner
    const spinners = container.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)
    expect(container.querySelector('.animate-morph')).not.toBeInTheDocument()
  })

  it('renders bars spinner when random selects type 3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // Will select type 3 (bars)

    const { container } = render(<LoadingStates randomVerb="Testing" />)

    // Check for unique elements of bars spinner
    expect(container.querySelector('.animate-bounce-slow')).toBeInTheDocument()
    expect(container.querySelector('.animate-bounce-medium')).toBeInTheDocument()
    expect(container.querySelector('.animate-bounce-fast')).toBeInTheDocument()
  })

  it('applies correct styling to the container', () => {
    const { container } = render(<LoadingStates randomVerb="Processing" />)
    const wrapper = container.firstChild as HTMLElement

    expect(wrapper).toHaveClass('flex', 'items-center', 'gap-3', 'mt-4', 'pl-4')
  })

  it('applies correct styling to the verb text', () => {
    render(<LoadingStates randomVerb="Thinking" />)
    const text = screen.getByText('Thinking')

    expect(text).toHaveClass(
      'text-sm',
      'font-medium',
      'text-muted-foreground',
      'opacity-80',
      'animate-fade-pulse',
    )
  })
})
