import { AlertCircle, AlertTriangle, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type PacingStatusBadgeProps = {
  pacingPct: number
  size?: "sm" | "md" | "lg"
  showIcon?: boolean
  showLabel?: boolean
  className?: string
}

type StatusTone = "on-track" | "slight" | "off"

const getPacingStatus = (pacingPct: number): StatusTone => {
  const d = Math.abs(Number(pacingPct) - 100)
  if (!Number.isFinite(d)) return "on-track"
  if (d <= 10) return "on-track"
  if (d <= 20) return "slight"
  return "off"
}

const statusStyles: Record<
  StatusTone,
  {
    label: string
    textClass: string
    bgClass: string
    Icon: typeof Check
  }
> = {
  "on-track": {
    label: "On track",
    textClass: "text-green-700 dark:text-green-400",
    bgClass: "bg-green-500/15",
    Icon: Check,
  },
  slight: {
    label: "Slightly off",
    textClass: "text-amber-700 dark:text-amber-400",
    bgClass: "bg-amber-500/15",
    Icon: AlertTriangle,
  },
  off: {
    label: "Off pace",
    textClass: "text-red-700 dark:text-red-400",
    bgClass: "bg-red-500/15",
    Icon: AlertCircle,
  },
}

const sizeStyles = {
  sm: {
    text: "text-[11px]",
    padding: "px-2 py-0.5",
    gap: "gap-1",
    icon: "h-3.5 w-3.5",
  },
  md: {
    text: "text-[13px]",
    padding: "px-2.5 py-1",
    gap: "gap-1.5",
    icon: "h-4 w-4",
  },
  lg: {
    text: "text-[15px]",
    padding: "px-3 py-1.5",
    gap: "gap-2",
    icon: "h-5 w-5",
  },
} as const

export function PacingStatusBadge({
  pacingPct,
  size = "md",
  showIcon = true,
  showLabel = true,
  className,
}: PacingStatusBadgeProps) {
  const status = getPacingStatus(pacingPct)
  const tone = statusStyles[status]
  const sizes = sizeStyles[size]
  const Icon = tone.Icon

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold leading-none",
        tone.bgClass,
        tone.textClass,
        sizes.text,
        sizes.padding,
        showIcon && showLabel ? sizes.gap : "",
        status === "off" ? "animate-pulse [animation-duration:2.4s]" : "",
        className
      )}
      aria-label={`Pacing status ${tone.label} at ${pacingPct.toFixed(2)} percent`}
    >
      {showIcon ? <Icon className={sizes.icon} aria-hidden="true" /> : null}
      {showLabel ? <span>{tone.label}</span> : null}
    </span>
  )
}
