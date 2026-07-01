import * as React from "react"
import { EXPERT_WEEK_COL_MIN_PX, EXPERT_WEEK_COL_MAX_PX } from "@/lib/mediaplan/expertGridInteractions"

export function ExpertGridWeekResizeHandle({ weekKey, currentWidth, onResize }: {
  weekKey: string
  currentWidth: number
  onResize: (weekKey: string, px: number) => void
}) {
  const startX = React.useRef(0)
  const startW = React.useRef(currentWidth)
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault()
    startX.current = e.clientX; startW.current = currentWidth
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement
    if (!el.hasPointerCapture?.(e.pointerId)) return
    e.stopPropagation()
    const next = Math.min(EXPERT_WEEK_COL_MAX_PX, Math.max(EXPERT_WEEK_COL_MIN_PX, startW.current + (e.clientX - startX.current)))
    onResize(weekKey, next)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }
  return (
    <div
      role="separator" aria-orientation="vertical" title="Drag to resize column (this session)"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-[60] h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-primary/40"
    />
  )
}
