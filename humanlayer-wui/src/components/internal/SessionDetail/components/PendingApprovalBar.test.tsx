import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PendingApprovalBar } from './PendingApprovalBar'

describe('PendingApprovalBar', () => {
  const defaultProps = {
    hasPendingApprovalsOutOfView: false,
    onClick: vi.fn(),
  }

  it('is hidden when there are no pending approvals out of view', () => {
    const { container } = render(<PendingApprovalBar {...defaultProps} />)
    const bar = container.firstChild as HTMLElement

    expect(bar).toHaveClass('opacity-0', 'translate-y-full', 'pointer-events-none')
  })

  it('is visible when there are pending approvals out of view', () => {
    const { container } = render(
      <PendingApprovalBar {...defaultProps} hasPendingApprovalsOutOfView={true} />,
    )
    const bar = container.firstChild as HTMLElement

    expect(bar).toHaveClass('opacity-100', 'translate-y-0')
    expect(bar).not.toHaveClass('pointer-events-none')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<PendingApprovalBar hasPendingApprovalsOutOfView={true} onClick={onClick} />)

    const bar = screen.getByText('Pending Approval').closest('div')?.parentElement
    fireEvent.click(bar!)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('displays the pending approval text', () => {
    render(<PendingApprovalBar {...defaultProps} hasPendingApprovalsOutOfView={true} />)

    expect(screen.getByText('Pending Approval')).toBeInTheDocument()
  })

  it('shows animated chevron icon', () => {
    const { container } = render(
      <PendingApprovalBar {...defaultProps} hasPendingApprovalsOutOfView={true} />,
    )

    const chevron = container.querySelector('.animate-bounce')
    expect(chevron).toBeInTheDocument()
    expect(chevron).toHaveClass('w-3', 'h-3')
  })

  it('has correct styling for the bar', () => {
    render(<PendingApprovalBar {...defaultProps} hasPendingApprovalsOutOfView={true} />)

    const innerBar = screen.getByText('Pending Approval').closest('div')
    expect(innerBar).toHaveClass(
      'flex',
      'items-center',
      'justify-center',
      'gap-1',
      'font-mono',
      'text-xs',
      'uppercase',
      'tracking-wider',
      'text-muted-foreground',
    )
  })
})
