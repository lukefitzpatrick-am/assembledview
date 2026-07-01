import * as React from "react"

export function useExpertRowReorder(onReorder: (fromIndex: number, toIndex: number) => void) {
  const [dragRowIndex, setDragRowIndex] = React.useState<number | null>(null)
  const [dropRowIndex, setDropRowIndex] = React.useState<number | null>(null)

  const handleProps = React.useCallback((rowIndex: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", String(rowIndex))
      setDragRowIndex(rowIndex)
    },
    onDragEnd: () => { setDragRowIndex(null); setDropRowIndex(null) },
  }), [])

  const rowDropProps = React.useCallback((rowIndex: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragRowIndex === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setDropRowIndex(rowIndex)
    },
    onDragLeave: () => { setDropRowIndex((cur) => (cur === rowIndex ? null : cur)) },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragRowIndex !== null) onReorder(dragRowIndex, rowIndex)
      setDragRowIndex(null); setDropRowIndex(null)
    },
  }), [dragRowIndex, dropRowIndex, onReorder])

  const isDropTarget = React.useCallback(
    (rowIndex: number) => dropRowIndex === rowIndex && dragRowIndex !== null && dragRowIndex !== rowIndex,
    [dragRowIndex, dropRowIndex],
  )

  return { dragRowIndex, dropRowIndex, handleProps, rowDropProps, isDropTarget }
}
