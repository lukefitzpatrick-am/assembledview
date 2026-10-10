"use client"

import type { ReactNode } from "react"

import { segmentChipClass } from "@/components/layout/navChip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type MediaTypeChip = {
  id: string
  label: string
  targetId: string
}

function scrollChipTarget(targetId: string) {
  if (typeof window === "undefined") return
  window.setTimeout(() => {
    const target = document.getElementById(targetId)
    const scroller = document.getElementById("main")
    if (!target || !scroller) return
    const offset = 64
    const nextTop =
      scroller.scrollTop +
      (target.getBoundingClientRect().top - scroller.getBoundingClientRect().top) -
      offset
    scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
  }, 0)
}

/** Sticky chips for enabled media types. The switch grid lives in the add popover. */
export function MediaTypeChipRow({
  chips,
  children,
}: {
  chips: MediaTypeChip[]
  children: ReactNode
}) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 bg-surface-muted py-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={cn(segmentChipClass(false), "border border-border bg-card")}
          onClick={() => scrollChipTarget(chip.targetId)}
        >
          {chip.label}
        </button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(segmentChipClass(false), "border border-dashed border-border bg-card")}
          >
            + Add media type
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(42rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-3 shadow-e2"
        >
          {children}
        </PopoverContent>
      </Popover>
    </div>
  )
}
