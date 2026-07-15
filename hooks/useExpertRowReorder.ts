import * as React from "react"

import { virtualRowIndexFromOffsetY } from "@/lib/mediaplan/oohExpertVirtualization"

export type ExpertRowReorderVirtualConfig = {
  rowCount: number
  estimateSizePx: number
  getScrollElement: () => HTMLElement | null
  /**
   * Pixel offset from the top of the scroll content to the first virtual body
   * row (typically measured `<thead>` height). Used so drop targeting ignores
   * the sticky header and any content above the row list.
   */
  getBodyOffsetTop: () => number
  /** Edge band (px) that triggers auto-scroll while dragging. */
  autoScrollEdgePx?: number
  autoScrollStepPx?: number
}

/**
 * Row reorder via HTML5 DnD.
 *
 * Optional `virtual` config (OOH F-28 Phase 2): resolve drop index from pointer
 * Y even when the target row is scrolled out of the mounted window, and
 * auto-scroll the grid while dragging near the viewport edges. Other Expert
 * grids omit `virtual` and keep prior behaviour.
 */
export function useExpertRowReorder(
  onReorder: (fromIndex: number, toIndex: number) => void,
  virtual?: ExpertRowReorderVirtualConfig | null
) {
  const [dragRowIndex, setDragRowIndex] = React.useState<number | null>(null)
  const [dropRowIndex, setDropRowIndex] = React.useState<number | null>(null)
  const dragRowIndexRef = React.useRef<number | null>(null)
  dragRowIndexRef.current = dragRowIndex
  const virtualRef = React.useRef(virtual)
  virtualRef.current = virtual
  const onReorderRef = React.useRef(onReorder)
  onReorderRef.current = onReorder

  const resolveVirtualDropIndex = React.useCallback(
    (clientY: number): number | null => {
      const cfg = virtualRef.current
      if (!cfg || cfg.rowCount <= 0) return null
      const scrollEl = cfg.getScrollElement()
      if (!scrollEl) return null
      const rect = scrollEl.getBoundingClientRect()
      const bodyOffset = cfg.getBodyOffsetTop()
      const offsetYInBody =
        scrollEl.scrollTop + (clientY - rect.top) - bodyOffset
      return virtualRowIndexFromOffsetY(
        offsetYInBody,
        cfg.estimateSizePx,
        cfg.rowCount
      )
    },
    []
  )

  React.useEffect(() => {
    if (dragRowIndex === null || !virtual) return

    const edge = virtual.autoScrollEdgePx ?? 48
    const step = virtual.autoScrollStepPx ?? 28

    const onDragOver = (e: DragEvent) => {
      const scrollEl = virtualRef.current?.getScrollElement()
      if (!scrollEl) return
      const rect = scrollEl.getBoundingClientRect()
      if (e.clientY < rect.top || e.clientY > rect.bottom) return
      if (e.clientX < rect.left || e.clientX > rect.right) return

      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move"

      if (e.clientY < rect.top + edge) {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - step)
      } else if (e.clientY > rect.bottom - edge) {
        scrollEl.scrollTop = scrollEl.scrollTop + step
      }

      const idx = resolveVirtualDropIndex(e.clientY)
      if (idx !== null) setDropRowIndex(idx)
    }

    const onDrop = (e: DragEvent) => {
      const scrollEl = virtualRef.current?.getScrollElement()
      if (!scrollEl) return
      const rect = scrollEl.getBoundingClientRect()
      if (
        e.clientY < rect.top ||
        e.clientY > rect.bottom ||
        e.clientX < rect.left ||
        e.clientX > rect.right
      ) {
        return
      }
      e.preventDefault()
      const from = dragRowIndexRef.current
      const to = resolveVirtualDropIndex(e.clientY)
      if (from !== null && to !== null) onReorderRef.current(from, to)
      setDragRowIndex(null)
      setDropRowIndex(null)
    }

    // Capture on document so spacer/padding regions still receive events.
    document.addEventListener("dragover", onDragOver)
    document.addEventListener("drop", onDrop)
    return () => {
      document.removeEventListener("dragover", onDragOver)
      document.removeEventListener("drop", onDrop)
    }
  }, [dragRowIndex, virtual, resolveVirtualDropIndex])

  const handleProps = React.useCallback(
    (rowIndex: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", String(rowIndex))
        setDragRowIndex(rowIndex)
      },
      onDragEnd: () => {
        setDragRowIndex(null)
        setDropRowIndex(null)
      },
    }),
    []
  )

  const rowDropProps = React.useCallback(
    (rowIndex: number) => ({
      onDragOver: (e: React.DragEvent) => {
        if (dragRowIndex === null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        // Prefer precise row hover when the row is mounted.
        setDropRowIndex(rowIndex)
      },
      onDragLeave: () => {
        setDropRowIndex((cur) => (cur === rowIndex ? null : cur))
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (dragRowIndex !== null) onReorder(dragRowIndex, rowIndex)
        setDragRowIndex(null)
        setDropRowIndex(null)
      },
    }),
    [dragRowIndex, onReorder]
  )

  const isDropTarget = React.useCallback(
    (rowIndex: number) =>
      dropRowIndex === rowIndex &&
      dragRowIndex !== null &&
      dragRowIndex !== rowIndex,
    [dragRowIndex, dropRowIndex]
  )

  return { dragRowIndex, dropRowIndex, handleProps, rowDropProps, isDropTarget }
}
