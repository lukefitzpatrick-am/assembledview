/**
 * Soft signal: Expert Apply updated the form draft; page Save has not run yet.
 * Cleared via signalMediaPlanPageSaved when hasUnsavedChanges flips to false.
 */

const SAVED_EVENT = "av-mediaplan-page-saved"

export function signalMediaPlanPageSaved(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(SAVED_EVENT))
}

export function subscribeMediaPlanPageSaved(onSaved: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SAVED_EVENT, onSaved)
  return () => window.removeEventListener(SAVED_EVENT, onSaved)
}
