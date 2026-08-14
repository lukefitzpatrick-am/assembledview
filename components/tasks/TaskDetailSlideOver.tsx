"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"

import { SlideOver } from "@/components/ui/SlideOver"
import { TaskDetailClient } from "@/components/tasks/TaskDetailClient"
import {
  TASK_DETAIL_WIDTH_DEFAULT,
  clampTaskDetailWidth,
  persistTaskDetailWidth,
  readStoredTaskDetailWidth,
} from "@/lib/codex/taskDetailWidth"
import { cn } from "@/lib/utils"

export function TaskDetailSlideOver({
  open,
  taskId,
  onClose,
}: {
  open: boolean
  taskId: number | null
  onClose: () => void
}) {
  const [width, setWidth] = useState(TASK_DETAIL_WIDTH_DEFAULT)
  const widthRef = useRef(width)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const stored = readStoredTaskDetailWidth(window.innerWidth)
    widthRef.current = stored
    setWidth(stored)
  }, [])

  const applyWidth = useCallback((next: number, persist: boolean) => {
    const clamped = clampTaskDetailWidth(next, window.innerWidth)
    widthRef.current = clamped
    setWidth(clamped)
    if (persist) persistTaskDetailWidth(clamped)
  }, [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startWidth: width }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    applyWidth(drag.startWidth + (drag.startX - e.clientX), false)
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      persistTaskDetailWidth(widthRef.current)
    }
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <SlideOver
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Task"
      hideHeader
      overlayClassName="bg-foreground/40"
      contentClassName="w-auto max-w-none sm:max-w-none"
      contentStyle={{ width: `${width}px`, maxWidth: "80vw" }}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize task panel"
          tabIndex={0}
          className={cn(
            "absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none",
            "bg-transparent hover:bg-border focus-visible:bg-ring",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => applyWidth(TASK_DETAIL_WIDTH_DEFAULT, true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault()
              applyWidth(widthRef.current + 24, true)
            }
            if (e.key === "ArrowRight") {
              e.preventDefault()
              applyWidth(widthRef.current - 24, true)
            }
          }}
        />
        {open && taskId != null ? <TaskDetailClient taskId={taskId} /> : null}
      </div>
    </SlideOver>
  )
}
