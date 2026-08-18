/**
 * Save-dialog document steps (MBA PDF / Media Plan file).
 * Document generate refuses Draft — the dialog must show that as a
 * neutral SKIP, not a red failure ("my save failed").
 */

import { isDownloadableCampaignStatus } from "@/lib/docs/isApprovedOrBeyond"

export const DOC_SKIP_REASON = "Documents generate once the campaign is past Draft"

export const DOC_STEP_MBA = "MBA PDF Upload"
export const DOC_STEP_MEDIA_PLAN = "Media Plan Upload"
export const DOC_STEP_AA_MEDIA_PLAN = "AA Media Plan Upload"

export type SaveDocStepStatus = "pending" | "success" | "error" | "skipped"

export type SaveDocStepItem = {
  name: string
  status: SaveDocStepStatus
  error?: string
}

/** True when campaign status is Draft (or empty) — doc generation is an expected skip. */
export function shouldSkipDocsForCampaignStatus(status: unknown): boolean {
  return !isDownloadableCampaignStatus(status)
}

/** PC3 / persisted-render gate messages that must never look like save failures. */
export function isExpectedDocGateSkipError(message: unknown): boolean {
  const m = String(message ?? "")
  if (!m) return false
  return (
    /approved-or-beyond/i.test(m) ||
    /past Draft/i.test(m) ||
    /Document render requires/i.test(m) ||
    /Document download requires/i.test(m)
  )
}

/**
 * Dialog chrome: only real `error` rows enter "Saving with Errors".
 * Skips alone → success/complete state once nothing is pending.
 */
export function savingDialogHasErrors(items: ReadonlyArray<{ status: string }>): boolean {
  return items.some((item) => item.status === "error")
}

export function savingDialogAllComplete(
  items: ReadonlyArray<{ status: string }>
): boolean {
  return items.length > 0 && items.every((item) => item.status !== "pending")
}

export function savingDialogTitleKind(
  items: ReadonlyArray<{ status: string }>,
  isSaving: boolean
): "errors" | "complete" | "saving" {
  if (savingDialogHasErrors(items)) return "errors"
  if (!isSaving && savingDialogAllComplete(items)) return "complete"
  return "saving"
}

/** Build skipped status rows for the standard doc steps. */
export function skippedDocStepItems(
  reason: string = DOC_SKIP_REASON
): SaveDocStepItem[] {
  return [
    { name: DOC_STEP_MBA, status: "skipped", error: reason },
    { name: DOC_STEP_MEDIA_PLAN, status: "skipped", error: reason },
  ]
}

/** Map a thrown/gate message to skipped (PC3) vs real error. */
export function classifyDocStepFailure(message: unknown): {
  status: "skipped" | "error"
  error: string
} {
  if (isExpectedDocGateSkipError(message)) {
    return { status: "skipped", error: DOC_SKIP_REASON }
  }
  const error = String(message ?? "").trim() || "Document step failed"
  return { status: "error", error }
}
