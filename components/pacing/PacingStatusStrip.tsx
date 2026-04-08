"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  aggregateStatusCounts,
  normalizePacingStatusKey,
} from "@/components/pacing/pacingMetrics"
import type { LineItemPacingRow } from "@/lib/xano/pacing-types"

/** Order segments left-to-right for a consistent strip. */
const SEGMENT_ORDER: string[] = [
  "no_delivery",
  "under_pacing",
  "over_pacing",
  "slightly_under",
  "slightly_over",
  "on_track",
  "not_started",
  "completed",
]

const SEGMENT_CLASS: Record<string, string> = {
  on_track: "bg-emerald-500/85",
  slightly_under: "bg-amber-500/80",
  slightly_over: "bg-amber-500/80",
  under_pacing: "bg-red-500/85",
  over_pacing: "bg-red-500/85",
  no_delivery: "bg-red-600/75 outline outline-1 outline-red-500/30",
  not_started: "bg-muted-foreground/45",
  completed: "bg-muted-foreground/35",
}

export function PacingStatusStrip({
  rows,
  className,
}: {
  rows: LineItemPacingRow[]
  className?: string
}) {
  const segments = useMemo(() => {
    const counts = aggregateStatusCounts(rows)
    const total = rows.length
    if (total === 0) return []
    const ordered: { key: string; pct: number }[] = []
    for (const key of SEGMENT_ORDER) {
      const n = counts.get(key) ?? 0
      if (n > 0) ordered.push({ key, pct: (n / total) * 100 })
    }
    for (const [k, n] of counts.entries()) {
      if (!SEGMENT_ORDER.includes(k)) {
        if (n > 0) ordered.push({ key: k, pct: (n / total) * 100 })
      }
    }
    return ordered
  }, [rows])

  if (rows.length === 0) {
    return (
      <div
        className={cn("mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/50", className)}
        aria-hidden
      />
    )
  }

  return (
    <div
      className={cn("mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted/40", className)}
      title="Share of line items by pacing status"
    >
      {segments.map(({ key, pct }) => (
        <div
          key={key}
          className={cn(
            "h-full min-w-[2px] shrink-0 transition-[width]",
            SEGMENT_CLASS[normalizePacingStatusKey(key)] ?? "bg-muted-foreground/40"
          )}
          style={{ width: `${Math.max(pct, 0)}%` }}
        />
      ))}
    </div>
  )
}
