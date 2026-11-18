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
 * The empty regions render on the first render (and on the server), so a
 * window open on the first render cannot hide them (B58fix R4). Which
 * Announcer owns them is settled in an effect; until then they stay empty, so
 * a second Announcer never repeats a message before it drops its regions.
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

/** The app's one pair of live regions. A second mount renders nothing once its effect has run. */
export function Announcer() {
  const current = React.useSyncExternalStore(subscribe, () => messages, () => EMPTY)
  const [token] = React.useState(() => Symbol("announcer"))
  const [role, setRole] = React.useState<"pending" | "owner" | "other">("pending")
  React.useEffect(() => {
    // shortcut: a second Announcer stays silent even after the first unmounts, take over on unmount if a page ever mounts its own
    if (owner) {
      setRole("other")
      return
    }
    owner = token
    setRole("owner")
    return () => {
      if (owner === token) owner = null
    }
  }, [token])
  if (role === "other") return null
  const shown = role === "owner" ? current : EMPTY
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-announcer="polite">
        {shown.polite ? <span key={shown.polite.id}>{shown.polite.text}</span> : null}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" data-announcer="assertive">
        {shown.assertive ? <span key={shown.assertive.id}>{shown.assertive.text}</span> : null}
      </div>
    </>
  )
}
