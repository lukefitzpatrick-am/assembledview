"use client"

import * as React from "react"

/**
 * Focus goes back to the control that opened a dialog (B57).
 *
 * Radix puts focus back on its Trigger when a dialog closes. A dialog opened
 * from state (no Trigger, the usual shape here) drops focus on the page body.
 * The Root wrappers (`Dialog`, `AlertDialog`, `Sheet`) keep the element that
 * had focus on the render where `open` turned true. The Content wrappers put
 * focus back on it when the dialog closes or unmounts. A caller's own
 * `onCloseAutoFocus` runs first and wins when it calls `preventDefault`.
 */
const OpenerContext = React.createContext<React.MutableRefObject<HTMLElement | null> | null>(null)

export function OpenerScope({ open, children }: { open: boolean | undefined; children: React.ReactNode }) {
  const opener = React.useRef<HTMLElement | null>(null)
  const wasOpen = React.useRef(false)
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
  }
  wasOpen.current = Boolean(open)
  return <OpenerContext.Provider value={opener}>{children}</OpenerContext.Provider>
}

/** The Content's `onCloseAutoFocus`: the caller's handler, then back to the opener. */
export function useReturnFocus(onCloseAutoFocus?: (event: Event) => void) {
  const opener = React.useContext(OpenerContext)
  return (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return
    const el = opener?.current
    if (!el?.isConnected) return
    event.preventDefault()
    el.focus()
  }
}
