"use client"

import { cn } from "@/lib/utils"
import type { ContainerEntryMode } from "@/lib/mediaplan/containerEntryMode"

/**
 * Shared Card entry / Schedule grid segmented control for media containers.
 */
export function ContainerEntryModeToggle({
  mode,
  onModeChange,
  label = "Entry mode",
  accentHex,
  attention,
  className,
}: {
  mode: ContainerEntryMode
  onModeChange: (mode: ContainerEntryMode) => void
  label?: string
  /** Channel accent for the active segment (existing container pattern). */
  accentHex: string
  attention?: boolean
  className?: string
}) {
  const isCard = mode === "card"
  const isSchedule = mode === "schedule"

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div
        role="group"
        aria-label={label}
        className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
      >
        <button
          type="button"
          aria-pressed={isCard}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            isCard ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          style={isCard ? { backgroundColor: accentHex } : undefined}
          onClick={() => onModeChange("card")}
        >
          Card entry
        </button>
        <button
          type="button"
          aria-pressed={isSchedule}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            isSchedule ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
            attention && isCard && "animate-pulse"
          )}
          style={{
            ...(isSchedule ? { backgroundColor: accentHex } : {}),
            ...(attention && isCard
              ? { boxShadow: `0 0 0 2px color-mix(in srgb, ${accentHex} 45%, transparent)` }
              : {}),
          }}
          onClick={() => onModeChange("schedule")}
        >
          Schedule grid
        </button>
      </div>
      <p className="max-w-[16rem] text-right text-[11px] leading-snug text-muted-foreground">
        {isSchedule
          ? "Week grid for quantities — Apply copies into the plan (not saved yet)."
          : "One card per line — edit fields and bursts directly."}
      </p>
    </div>
  )
}
