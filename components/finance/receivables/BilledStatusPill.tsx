"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type BilledStatusPillProps = {
  billed: boolean | undefined
  /** When billed and the recomputed month total / lines differ from the bill-time snapshot. */
  drift?: boolean
  driftDelta?: number | null
  className?: string
  onToggle?: (nextBilled: boolean) => void | Promise<void>
  disabled?: boolean
}

function formatDriftDelta(delta: number | null | undefined): string {
  if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) return ""
  const abs = Math.abs(delta)
  const formatted = abs.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  })
  return delta > 0 ? `+${formatted}` : `-${formatted}`
}

export function BilledStatusPill({
  billed,
  drift,
  driftDelta,
  className,
  onToggle,
  disabled,
}: BilledStatusPillProps) {
  const isBilled = billed === true
  const showDrift = isBilled && drift === true
  const [busy, setBusy] = useState(false)

  const label = showDrift ? "Billed · Drift" : isBilled ? "Billed" : "Unbilled"
  const deltaLabel = showDrift ? formatDriftDelta(driftDelta) : ""
  const title = showDrift
    ? `Current total differs from the amount invoiced at bill time${
        deltaLabel ? ` (${deltaLabel})` : ""
      }. The billed snapshot was not overwritten.`
    : undefined

  const toneClass = showDrift
    ? "bg-pacing-critical-bg text-status-critical-fg"
    : isBilled
      ? "bg-pacing-ahead-bg text-status-ahead-fg"
      : "bg-pacing-behind-bg text-status-behind-fg"

  if (!onToggle) {
    return (
      <span
        title={title}
        className={cn(
          "inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          toneClass,
          className
        )}
      >
        {label}
        {deltaLabel ? <span className="num ml-1 normal-case tracking-normal">{deltaLabel}</span> : null}
      </span>
    )
  }

  const handleClick = async () => {
    if (busy || disabled === true) return
    setBusy(true)
    try {
      await onToggle(!isBilled)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      aria-pressed={isBilled}
      aria-label={
        showDrift
          ? "Billed with drift — mark as unbilled"
          : isBilled
            ? "Mark as unbilled"
            : "Mark as billed"
      }
      title={title}
      disabled={busy || disabled === true}
      onClick={handleClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        toneClass,
        "cursor-pointer transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {label}
      {deltaLabel ? <span className="num normal-case tracking-normal">{deltaLabel}</span> : null}
    </button>
  )
}
