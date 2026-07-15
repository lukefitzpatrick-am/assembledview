/**
 * Aggregated builder issues for the click-to-navigate checklist (UX-4).
 * Sources fold existing warnings — this does not invent a second validation engine.
 */

export type BuilderIssueSeverity = "warning" | "error"

export type BuilderIssue = {
  id: string
  severity: BuilderIssueSeverity
  title: string
  detail?: string
  /** DOM id to scrollIntoView when the item is clicked */
  scrollTargetId?: string
}

export function scrollToBuilderTarget(scrollTargetId: string | undefined): void {
  if (!scrollTargetId || typeof window === "undefined") return
  window.setTimeout(() => {
    document.getElementById(scrollTargetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }, 0)
}
