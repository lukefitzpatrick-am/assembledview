"use client"

import { useCallback, type KeyboardEvent } from "react"

import { CLIENT_DASHBOARD_FOCUS_RING } from "@/components/client-dashboard/focus-styles"
import { cn } from "@/lib/utils"

export type LegendTogglePayload = {
  value?: unknown
  dataKey?: string | number
  color?: string
}

type ToggleableLegendProps = {
  payload?: LegendTogglePayload[]
  hiddenKeys: ReadonlySet<string>
  onToggleKey: (key: string) => void
}

export function ToggleableLegend({ payload, hiddenKeys, onToggleKey }: ToggleableLegendProps) {
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        onToggleKey(key)
      }
    },
    [onToggleKey],
  )

  if (!payload?.length) {
    return null
  }

  return (
    <ul className="flex flex-wrap justify-center gap-2 px-2 pb-2 pt-1">
      {payload.map((entry, index) => {
        const key = String(entry.dataKey ?? entry.value ?? index)
        const hidden = hiddenKeys.has(key)
        return (
          <li key={key}>
            <button
              type="button"
              aria-pressed={!hidden}
              aria-label={`Toggle series ${String(entry.value ?? key)}`}
              onClick={() => onToggleKey(key)}
              onKeyDown={(e) => onKeyDown(e, key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs font-medium transition-colors",
                CLIENT_DASHBOARD_FOCUS_RING,
                hidden ? "text-muted-foreground opacity-50 line-through" : "text-foreground",
              )}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span>{String(entry.value ?? key)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
