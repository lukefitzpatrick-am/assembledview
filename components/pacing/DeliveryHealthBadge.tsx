"use client"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PacingDeliveryHealth } from "@/lib/xano/pacing-types"

const HEALTH_LABEL: Record<PacingDeliveryHealth, string> = {
  spending: "Spending",
  paused_yesterday: "Paused yesterday",
  no_recent_delivery: "No recent delivery",
  no_delivery: "No delivery",
}

function norm(raw: string | null | undefined): PacingDeliveryHealth | "unknown" {
  const s = String(raw ?? "").trim().toLowerCase() as PacingDeliveryHealth
  if (s in HEALTH_LABEL) return s
  return "unknown"
}

export function DeliveryHealthBadge({ health }: { health: string | null | undefined }) {
  const key = norm(health)
  const label =
    key === "unknown" ? (health ? String(health) : "—") : HEALTH_LABEL[key as PacingDeliveryHealth]

  if (key === "no_delivery") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex max-w-[10rem] items-center truncate rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white">
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const dot = (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        key === "spending" && "bg-emerald-500",
        key === "paused_yesterday" && "bg-amber-500",
        key === "no_recent_delivery" && "bg-red-500",
        key === "unknown" && "bg-muted-foreground/40"
      )}
    />
  )

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {dot}
            <span className="max-w-[9rem] truncate">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
