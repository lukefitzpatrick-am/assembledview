"use client"

import { cn } from "@/lib/utils"
import { formatPacingPct1 } from "@/components/pacing/formatters"

const NEUTRAL_BAND = 2

export function VarianceBar({
  value,
  className,
}: {
  value: number | null | undefined
  className?: string
}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const v = Number(value)
  const neutral = Math.abs(v) <= NEUTRAL_BAND
  const cap = 60
  const c = Math.max(-cap, Math.min(cap, v))
  const span = Math.max(20, Math.abs(c), 5)
  const halfFrac = Math.min(0.48, (Math.abs(c) / span) * 0.48)

  return (
    <div className={cn("relative h-7 w-full min-w-[96px] max-w-[180px] overflow-hidden rounded-md", className)}>
      <div className="absolute inset-0 rounded-md bg-muted/60" />
      <div className="absolute left-1/2 top-1 bottom-0 w-px -translate-x-px bg-border" />
      {!neutral && c < 0 ? (
        <div
          className="absolute top-1 bottom-1 rounded-l-sm bg-red-500/90"
          style={{
            right: "50%",
            width: `${halfFrac * 100}%`,
          }}
        />
      ) : null}
      {!neutral && c > 0 ? (
        <div
          className="absolute top-1 bottom-1 rounded-r-sm bg-red-500/90"
          style={{
            left: "50%",
            width: `${halfFrac * 100}%`,
          }}
        />
      ) : null}
      {neutral ? (
        <div className="absolute top-1 bottom-1 left-[45%] right-[45%] rounded-sm bg-emerald-500/35" />
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center px-1 text-[11px] font-semibold tabular-nums text-foreground drop-shadow-sm">
        {formatPacingPct1(v)}
      </div>
    </div>
  )
}
