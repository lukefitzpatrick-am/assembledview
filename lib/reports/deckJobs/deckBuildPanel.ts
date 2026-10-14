/**
 * Review & Report deck panel rules. No clock and no fetch live here.
 * Queued and generating poll until the row finishes or the panel has been open for 6 minutes.
 * A run is shown again only when it is under 24 hours old.
 */

export const DECK_POLL_MS = 5_000
export const DECK_POLL_DEADLINE_MS = 6 * 60 * 1000
export const DECK_REOPEN_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const DECK_REPORTS_HREF = "/admin/reports"

export const DECK_BUILDING_COPY =
  "Your deck is being built. This takes 1 to 3 minutes. You can leave this page; it'll be in Reports when it's done."

export const DECK_STILL_COPY = "Still building. Check Reports shortly."

export type DeckPanelPhase = "building" | "ready" | "failed" | "still"

export function deckPanelPhase(input: { status: string; watchedMs: number }): DeckPanelPhase {
  if (input.status === "generated") return "ready"
  if (input.status === "failed") return "failed"
  if (input.watchedMs >= DECK_POLL_DEADLINE_MS) return "still"
  return "building"
}

/** True while the panel should keep asking for status. */
export function shouldPollDeck(input: { status: string; watchedMs: number }): boolean {
  return deckPanelPhase(input) === "building"
}

/** True when this run should be shown again instead of starting another. */
export function isDeckRunReopenable(createdAt: string, nowMs: number): boolean {
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return false
  const age = nowMs - created
  return age >= 0 && age < DECK_REOPEN_MAX_AGE_MS
}

export function reviewReportStart(input: {
  createdAt: string | null
  nowMs: number
}): "reopen" | "start" {
  if (input.createdAt && isDeckRunReopenable(input.createdAt, input.nowMs)) return "reopen"
  return "start"
}

export function formatDeckElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes <= 0) return `${seconds} sec`
  if (seconds === 0) return `${minutes} min`
  return `${minutes} min ${seconds} sec`
}

export function plainDeckError(error: string | null | undefined): string {
  const text = error?.trim() ?? ""
  if (!text || text === "create_failed") return "The deck could not be built."
  return text
}

/** The note is the fallback reason. The heading is always "Basic layout". */
export function basicLayoutReason(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? ""
  if (!trimmed) return null
  const prefix = "basic layout:"
  if (trimmed.toLowerCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim()
  }
  return trimmed
}
