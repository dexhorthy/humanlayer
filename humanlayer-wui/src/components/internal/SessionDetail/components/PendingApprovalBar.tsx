import { ChevronDown } from 'lucide-react'

interface PendingApprovalBarProps {
  hasPendingApprovalsOutOfView: boolean
  onClick: () => void
}

export function PendingApprovalBar({ hasPendingApprovalsOutOfView, onClick }: PendingApprovalBarProps) {
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 p-2 cursor-pointer transition-all duration-300 ease-in-out ${
        hasPendingApprovalsOutOfView
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-full pointer-events-none'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-center gap-1 font-mono text-xs uppercase tracking-wider text-muted-foreground bg-background/60 backdrop-blur-sm border-t border-border/50 py-1 shadow-sm hover:bg-background/80 transition-colors">
        <span>Pending Approval</span>
        <ChevronDown className="w-3 h-3 animate-bounce" />
      </div>
    </div>
  )
}
