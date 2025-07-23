import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { SessionHeader } from './SessionHeader'
import { SessionInfo, SessionStatus } from '@/lib/daemon/types'
import { daemonClient } from '@/lib/daemon/client'
import { useStore } from '@/stores/appStore'

// Mock dependencies
vi.mock('@/lib/daemon/client', () => ({
  daemonClient: {
    updateSessionTitle: vi.fn(),
  },
}))

vi.mock('@/stores/appStore', () => ({
  useStore: {
    getState: vi.fn(() => ({
      updateSession: vi.fn(),
    })),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

const mockSession: SessionInfo = {
  id: 'session-123',
  status: SessionStatus.Completed,
  title: 'Test Session',
  summary: 'Test Summary',
  query: 'Test Query',
  model: 'test-model',
  working_dir: '/test/dir',
  archived: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  parent_session_id: null,
  auto_accept_edits: false,
}

describe('SessionHeader', () => {
  const defaultProps = {
    session: mockSession,
    events: [],
    previewEventIndex: null,
    onForkSelect: vi.fn(),
    forkViewOpen: false,
    setForkViewOpen: vi.fn(),
    isCompactView: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders session title', () => {
    render(<SessionHeader {...defaultProps} />)
    expect(screen.getByText('Test Session')).toBeInTheDocument()
  })

  it('shows archived indicator when session is archived', () => {
    const { container } = render(
      <SessionHeader {...defaultProps} session={{ ...mockSession, archived: true }} />,
    )
    expect(container.querySelector('.lucide-archive')).toBeInTheDocument()
  })

  it('shows [continued] suffix for continued sessions', () => {
    render(
      <SessionHeader {...defaultProps} session={{ ...mockSession, parent_session_id: 'parent-123' }} />,
    )
    expect(screen.getByText('[continued]')).toBeInTheDocument()
  })

  it('displays session status and model', () => {
    render(<SessionHeader {...defaultProps} />)
    expect(screen.getByText('completed / test-model')).toBeInTheDocument()
  })

  it('displays working directory when present', () => {
    render(<SessionHeader {...defaultProps} />)
    expect(screen.getByText('/test/dir')).toBeInTheDocument()
  })

  it('switches to edit mode when edit button is clicked', () => {
    render(<SessionHeader {...defaultProps} />)

    const editButton = screen.getByRole('button', { name: '' }) // Pencil icon button
    fireEvent.click(editButton)

    expect(screen.getByLabelText('Edit session title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('saves title on Enter key press', async () => {
    render(<SessionHeader {...defaultProps} />)

    const editButton = screen.getByRole('button', { name: '' })
    fireEvent.click(editButton)

    const input = screen.getByLabelText('Edit session title')
    fireEvent.change(input, { target: { value: 'New Title' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(daemonClient.updateSessionTitle).toHaveBeenCalledWith('session-123', 'New Title')
    })
  })

  it('cancels edit on Escape key press', () => {
    render(<SessionHeader {...defaultProps} />)

    const editButton = screen.getByRole('button', { name: '' })
    fireEvent.click(editButton)

    const input = screen.getByLabelText('Edit session title')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByLabelText('Edit session title')).not.toBeInTheDocument()
    expect(screen.getByText('Test Session')).toBeInTheDocument()
  })

  it('renders compact view with smaller text', () => {
    render(<SessionHeader {...defaultProps} isCompactView={true} />)

    const title = screen.getByText('Test Session').closest('h2')
    expect(title).toHaveClass('text-sm')
  })

  it('updates store after successful title save', async () => {
    const updateSession = vi.fn()
    vi.mocked(useStore.getState).mockReturnValue({ updateSession } as any)

    render(<SessionHeader {...defaultProps} />)

    const editButton = screen.getByRole('button', { name: '' })
    fireEvent.click(editButton)

    const saveButton = screen.getByRole('button', { name: 'Save' })
    const input = screen.getByLabelText('Edit session title')
    fireEvent.change(input, { target: { value: 'New Title' } })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(updateSession).toHaveBeenCalledWith('session-123', { title: 'New Title' })
    })
  })
})
