import { cn } from "@/lib/utils"
import { statusBadge, statusLabel, type DeliveryStatus } from "./statusColours"

export interface StatusPillProps {
  status: DeliveryStatus
  /** Optional label override. Defaults to the canonical status label. */
  label?: string
  className?: string
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusBadge[status],
        className,
      )}
    >
      {label ?? statusLabel[status]}
    </span>
  )
}
