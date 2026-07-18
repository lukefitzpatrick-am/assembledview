"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"

type ExpertGridFillHandleProps = {
  onFillAllBelow: () => void
  onFillDrag: (rowCount: number) => void
  className?: string
}

/**
 * Excel-style fill handle: double-click fills all rows below;
 * click-drag fills N rows below the source.
 */
export function ExpertGridFillHandle({
  onFillAllBelow,
  onFillDrag,
  className,
}: ExpertGridFillHandleProps) {
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const sourceRowRef = useRef<number | null>(null)

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label="Fill down"
      title="Double-click to fill all below; drag to fill"
      className={cn(
        "absolute bottom-0 right-0 z-10 h-2 w-2 cursor-crosshair rounded-input bg-primary",
        className
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        draggingRef.current = true
        movedRef.current = false
        startPointRef.current = { x: e.clientX, y: e.clientY }
        const tr = (e.currentTarget as HTMLElement).closest("tr")
        const raw = tr?.getAttribute("data-search-expert-row-index")
        sourceRowRef.current = raw != null ? Number(raw) : null
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current || !startPointRef.current) return
        const dx = e.clientX - startPointRef.current.x
        const dy = e.clientY - startPointRef.current.y
        if (dx * dx + dy * dy > 16) {
          movedRef.current = true
        }
      }}
      onPointerUp={(e) => {
        if (!draggingRef.current) return
        draggingRef.current = false
        const didMove = movedRef.current
        movedRef.current = false
        startPointRef.current = null
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
        if (!didMove) return
        const source = sourceRowRef.current
        sourceRowRef.current = null
        if (source == null || Number.isNaN(source)) return
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const rowEl = el?.closest?.("[data-search-expert-row-index]")
        if (!rowEl) return
        const target = Number(rowEl.getAttribute("data-search-expert-row-index"))
        if (Number.isNaN(target) || target <= source) return
        onFillDrag(target - source)
      }}
      onPointerCancel={() => {
        draggingRef.current = false
        movedRef.current = false
        startPointRef.current = null
        sourceRowRef.current = null
      }}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onFillAllBelow()
      }}
    />
  )
}
