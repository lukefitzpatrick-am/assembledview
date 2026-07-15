"use client"

import { cn } from "@/lib/utils"
import type { WeekStartsOn } from "@/lib/utils/weeklyGanttColumns"

const DAY_BUTTONS: ReadonlyArray<{ label: string; value: WeekStartsOn; name: string }> = [
  { label: "S", value: 0, name: "Sunday" },
  { label: "M", value: 1, name: "Monday" },
  { label: "T", value: 2, name: "Tuesday" },
  { label: "W", value: 3, name: "Wednesday" },
  { label: "T", value: 4, name: "Thursday" },
  { label: "F", value: 5, name: "Friday" },
  { label: "S", value: 6, name: "Saturday" },
]

/**
 * Compact week-commences control for expert Gantt grids.
 * View-only preference — not persisted to plan/version/Xano.
 */
export function ExpertGridWeekCommencesBar({
  weekStartsOn,
  onWeekStartsOnChange,
  className,
}: {
  weekStartsOn: WeekStartsOn
  onWeekStartsOnChange: (day: WeekStartsOn) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Week commences"
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Week from
      </span>
      {DAY_BUTTONS.map(({ label, value, name }) => {
        const active = weekStartsOn === value
        return (
          <button
            key={`${value}-${name}`}
            type="button"
            aria-pressed={active}
            aria-label={`Week starts on ${name}`}
            title={`Week starts on ${name}`}
            onClick={() => onWeekStartsOnChange(value)}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-sm text-[11px] font-semibold tabular-nums transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
