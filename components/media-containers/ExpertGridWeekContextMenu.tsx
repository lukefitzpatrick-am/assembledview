"use client"

import { useLayoutEffect, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { WEEK_CELL_CONTEXT_MENU_PASTE_UNAVAILABLE_REASON } from "@/lib/mediaplan/expertGridShared"

export { WEEK_CELL_CONTEXT_MENU_PASTE_UNAVAILABLE_REASON }

type ExpertGridWeekContextMenuProps = {
  x: number
  y: number
  pasteDisabled: boolean
  returnFocusTo?: HTMLElement | null
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

function enabledMenuItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(
    (el) => !el.disabled
  )
}

function moveMenuFocus(root: HTMLElement, direction: 1 | -1) {
  const items = enabledMenuItems(root)
  if (items.length === 0) return
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  const nextIndex =
    current < 0 ? 0 : (current + direction + items.length) % items.length
  items[nextIndex]?.focus()
}

export function ExpertGridWeekContextMenu({
  x,
  y,
  pasteDisabled,
  returnFocusTo,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onClose,
}: ExpertGridWeekContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const pad = 8
    const menuWidth = width > 0 ? width : 0
    const menuHeight = height > 0 ? height : 0
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - menuWidth - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - menuHeight - pad)),
    })
    enabledMenuItems(el)[0]?.focus()
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        returnFocusTo?.focus()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (rootRef.current) moveMenuFocus(rootRef.current, 1)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (rootRef.current) moveMenuFocus(rootRef.current, -1)
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      onClose()
    }
    const onScroll = () => {
      onClose()
    }
    const onResize = () => {
      onClose()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
    }
  }, [onClose, returnFocusTo])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label="Week cell"
      data-eg-week-context-menu=""
      className="z-popover fixed min-w-[11rem] overflow-hidden rounded-input border border-border bg-popover p-1 text-popover-foreground shadow-e2"
      style={{ left: pos.left, top: pos.top, pointerEvents: "auto" }}
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
