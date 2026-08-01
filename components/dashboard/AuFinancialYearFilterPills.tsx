"use client"

import { useId, useMemo, useRef, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"
import {
  auFyFilterOptions,
  type AuFyFilterValue,
} from "@/lib/dates/auFinancialYear"

export type AuFinancialYearFilterPillsProps = {
  value: AuFyFilterValue
  onChange: (next: AuFyFilterValue) => void
  /** Override "today" for tests / storybook. */
  today?: Date
  className?: string
}

function wrapIndex(index: number, length: number): number {
  if (index < 0) return length - 1
  if (index >= length) return 0
  return index
}

/**
 * Filter pills matching CampaignStatusPills / finance rounded-pill chrome.
 * Options: current AU FY, previous, next, All.
 */
export function AuFinancialYearFilterPills({
  value,
  onChange,
  today,
  className,
}: AuFinancialYearFilterPillsProps) {
  const groupId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const items = useMemo(() => auFyFilterOptions(today ?? new Date()), [today])

  const focusTab = (index: number) => {
    const next = wrapIndex(index, items.length)
    tabRefs.current[next]?.focus()
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
    nextValue: AuFyFilterValue,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        focusTab(currentIndex + 1)
        return
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        focusTab(currentIndex - 1)
        return
      case "Home":
        event.preventDefault()
        focusTab(0)
        return
      case "End":
        event.preventDefault()
        focusTab(items.length - 1)
        return
      case "Enter":
      case " ":
        event.preventDefault()
        onChange(nextValue)
        return
      default:
        return
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Financial year filter"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {items.map((item, index) => {
        const isActive = item.value === value
        const tabId = `${groupId}-fy-${String(item.value)}`

        return (
          <button
            key={String(item.value)}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={item.title}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index, item.value)}
            className={cn(
              "interactive-tint relative inline-flex items-center gap-2 overflow-hidden rounded-pill px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "border border-transparent bg-foreground text-background"
                : "border border-border bg-transparent text-muted-foreground hover:bg-muted/50",
            )}
          >
            <span className="relative z-10">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
