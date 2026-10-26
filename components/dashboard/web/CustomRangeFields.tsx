"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { addIsoDays, sydneyToday, validateCustomRange, type DateWindow } from "@/lib/webReport/periods"

/** Start and end date inputs for a custom range. End is capped at yesterday in Sydney. */
export function CustomRangeFields({
  initial,
  onApply,
  fieldClassName,
}: {
  initial: DateWindow | null
  onApply: (range: DateWindow) => void
  fieldClassName: string
}) {
  const today = sydneyToday()
  const yesterday = addIsoDays(today, -1)
  const [from, setFrom] = useState(initial?.from ?? addIsoDays(yesterday, -27))
  const [to, setTo] = useState(initial?.to ?? yesterday)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Start
          <input
            type="date"
            aria-label="Start date"
            className={fieldClassName}
            value={from}
            max={yesterday}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          End
          <input
            type="date"
            aria-label="End date"
            className={fieldClassName}
            value={to}
            max={yesterday}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9"
          onClick={() => {
            const checked = validateCustomRange(from, to, sydneyToday())
            if (!checked.ok) {
              setError(checked.error)
              return
            }
            setError(null)
            onApply({ from, to })
          }}
        >
          Apply
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-status-critical-fg">
          {error}
        </p>
      ) : null}
    </div>
  )
}
