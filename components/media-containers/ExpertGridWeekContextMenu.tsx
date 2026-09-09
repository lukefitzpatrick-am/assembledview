"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { WEEK_CELL_CONTEXT_MENU_PASTE_UNAVAILABLE_REASON } from "@/lib/mediaplan/expertGridShared"

export { WEEK_CELL_CONTEXT_MENU_PASTE_UNAVAILABLE_REASON }

type ExpertGridWeekContextMenuProps = {
  x: number
  y: number
  pasteDisabled: boolean
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
  onClose: () => void
}

function MenuItem({
  label,
  shortcut,
  disabled,
  disabledReason,
  onSelect,
}: {
  label: string
  shortcut: string
  disabled?: boolean
  disabledReason?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={cn(
        "flex w-full cursor-pointer items-center rounded-input px-2 py-1.5 text-sm outline-none",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
      )}
      onClick={() => {
        if (disabled) return
        onSelect()
      }}
    >
      <span>{label}</span>
      <span className="ml-auto pl-6 text-xs text-muted-foreground">{shortcut}</span>
    </button>
  )
}

export function ExpertGridWeekContextMenu({
  x,
  y,
  pasteDisabled,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onClose,
}: ExpertGridWeekContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [onClose])

  if (typeof document === "undefined") return null

  const left = Math.max(8, Math.min(x, window.innerWidth - 200))
  const top = Math.max(8, Math.min(y, window.innerHeight - 180))

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label="Week cell"
      data-eg-week-context-menu=""
      className="z-popover fixed min-w-[11rem] overflow-hidden rounded-input border border-border bg-popover p-1 text-popover-foreground shadow-e2"
      style={{ left, top }}
    >
      <MenuItem
        label="Cut"
        shortcut="Ctrl+X"
        onSelect={() => {
          onCut()
          onClose()
        }}
      />
      <MenuItem
        label="Copy"
        shortcut="Ctrl+C"
        onSelect={() => {
          onCopy()
          onClose()
        }}
      />
      <MenuItem
        label="Paste"
        shortcut="Ctrl+V"
        disabled={pasteDisabled}
        disabledReason={WEEK_CELL_CONTEXT_MENU_PASTE_UNAVAILABLE_REASON}
        onSelect={() => {
          onPaste()
          onClose()
        }}
      />
      <MenuItem
        label="Delete"
        shortcut="Del"
        onSelect={() => {
          onDelete()
          onClose()
        }}
      />
    </div>,
    document.body
  )
}
