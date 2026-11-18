"use client"

import * as React from "react"

/**
 * One place that speaks to screen readers (B58). `ClientLayout` mounts one
 * `Announcer` at the app root: a polite region and an assertive one (errors).
 * `announce()` puts one message in one region. Each call is read once, and the
 * same words said again are read again (each message is a new node).
 *
 * The regions carry `aria-live` as an attribute: a modal window hides the rest
 * of the page from screen readers (`aria-hidden`) but keeps `[aria-live]`
 * elements, so a message from a form inside a window is still read.
 *
 * Action results (saved, sent) stay as toasts, which the toast viewport reads.
 *
 * shortcut: the regions render after the first effect, so a window open on the
 * very first render would hide them; mount before any window opens (the app
 * root does), render them on the server if a page ever opens a window on load.
 */
type Politeness = "polite" | "assertive"
type Message = { id: number; text: string }
type Messages = Record<Politeness, Message | null>

const EMPTY: Messages = { polite: null, assertive: null }
let messages: Messages = EMPTY
let nextId = 0
const listeners = new Set<() => void>()
let owner: symbol | null = null

/** Say one message. Assertive for an error the user must act on, polite otherwise. */
export function announce(text: string, politeness: Politeness = "polite"): void {
  const said = text.trim()
  if (!said) return
  nextId += 1
  messages = { ...messages, [politeness]: { id: nextId, text: said } }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The app's one pair of live regions. A second mount renders nothing. */
export function Announcer() {
  const current = React.useSyncExternalStore(subscribe, () => messages, () => EMPTY)
  const [token] = React.useState(() => Symbol("announcer"))
  const [isOwner, setIsOwner] = React.useState(false)
  React.useEffect(() => {
    // shortcut: a second Announcer stays silent even after the first unmounts, take over on unmount if a page ever mounts its own
    if (owner) return
    owner = token
    setIsOwner(true)
    return () => {
      if (owner === token) owner = null
    }
  }, [token])
  if (!isOwner) return null
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-announcer="polite">
        {current.polite ? <span key={current.polite.id}>{current.polite.text}</span> : null}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" data-announcer="assertive">
        {current.assertive ? <span key={current.assertive.id}>{current.assertive.text}</span> : null}
      </div>
    </>
  )
}
