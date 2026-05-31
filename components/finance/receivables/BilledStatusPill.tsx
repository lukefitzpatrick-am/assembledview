"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type BilledStatusPillProps = {
  billed: boolean | undefined
  className?: string
  onToggle?: (nextBilled: boolean) => void | Promise<void>
  disabled?: boolean
}

export function BilledStatusPill({ billed, className, onToggle, disabled }: BilledStatusPillProps) {
  const isBilled = billed === true
  const [busy, setBusy] = useState(false)

  if (!onToggle) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          isBilled
            ? "bg-[hsl(var(--status-success))] text-[hsl(var(--status-success-foreground))]"
            : "bg-[hsl(var(--status-warning)/0.15)] text-amber-800 dark:text-amber-300",
          className
        )}
      >
        {isBilled ? "Billed" : "Unbilled"}
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
      aria-label={isBilled ? "Mark as unbilled" : "Mark as billed"}
      disabled={busy || disabled === true}
      onClick={handleClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isBilled
          ? "bg-[hsl(var(--status-success))] text-[hsl(var(--status-success-foreground))]"
          : "bg-[hsl(var(--status-warning)/0.15)] text-amber-800 dark:text-amber-300",
        "cursor-pointer transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {isBilled ? "Billed" : "Unbilled"}
    </button>
  )
}
