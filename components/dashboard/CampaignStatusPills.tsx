"use client"

import { Check } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import type { KeyboardEvent } from "react"
import { useId, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"

export type CampaignStatus = "live" | "planned" | "completed"

export interface StatusCount {
  live: number
  planned: number
  completed: number
}

export interface CampaignStatusPillsProps {
  activeStatus: CampaignStatus
  counts: StatusCount
  onChange: (status: CampaignStatus) => void
}

type StatusItem = {
  key: CampaignStatus
  label: string
  count: number
}

const statusOrder: readonly CampaignStatus[] = ["live", "planned", "completed"]

function wrapIndex(index: number, length: number): number {
  if (index < 0) return length - 1
  if (index >= length) return 0
  return index
}

export function CampaignStatusPills({ activeStatus, counts, onChange }: CampaignStatusPillsProps) {
  const shouldReduceMotion = useReducedMotion()
  const groupId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const items = useMemo<StatusItem[]>(
    () => [
      { key: "live", label: "Live", count: counts.live },
      { key: "planned", label: "Planned", count: counts.planned },
      { key: "completed", label: "Completed", count: counts.completed },
    ],
    [counts.completed, counts.live, counts.planned]
  )

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeStatus)
  )

  const focusTab = (index: number) => {
    const next = wrapIndex(index, items.length)
    tabRefs.current[next]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number, status: CampaignStatus) => {
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
        onChange(status)
        return
      default:
        return
    }
  }

  return (
    <div role="tablist" aria-label="Campaign status filters" className="flex flex-wrap gap-2">
      {items.map((item, index) => {
        const isActive = item.key === activeStatus
        const tabId = `${groupId}-tab-${item.key}`
        const panelId = `${groupId}-panel-${item.key}`

        return (
          <button
            key={item.key}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index, item.key)}
            className={cn(
              "relative inline-flex items-center gap-2 overflow-hidden rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "border border-transparent text-background"
                : "border border-border bg-transparent text-muted-foreground hover:bg-muted/50"
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={shouldReduceMotion ? undefined : "campaign-status-pill-active-bg"}
                className="absolute inset-0 rounded-full bg-foreground"
                transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                aria-hidden
              />
            ) : null}

            <motion.span
              animate={shouldReduceMotion ? undefined : { scale: isActive ? 1.03 : 1 }}
              transition={shouldReduceMotion ? undefined : { type: "spring", stiffness: 380, damping: 30 }}
              className="relative z-10 inline-flex items-center gap-2"
            >
              {item.key === "live" ? (
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
              ) : item.key === "planned" ? (
                <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              )}
              <span>
                {item.label} ({item.count.toLocaleString("en-US")})
              </span>
            </motion.span>
          </button>
        )
      })}
    </div>
  )
}
