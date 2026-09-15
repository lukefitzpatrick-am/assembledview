/**
 * Save-dialog document steps (MBA PDF / Media Plan file).
 * Unpublished versions skip doc generation — show as a neutral SKIP, not a
 * red failure ("my save failed").
 */

import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

export const DOC_SKIP_REASON = "Documents generate from published versions"

export const DOC_STEP_MBA = "MBA PDF Upload"
export const DOC_STEP_MEDIA_PLAN = "Media Plan Upload"
export const DOC_STEP_AA_MEDIA_PLAN = "AA Media Plan Upload"
/** Postgres publish path — one step so a generate failure cannot stay silent. */
export const DOC_STEP_POSTGRES_GENERATE = "Generate documents"

export type SaveDocStepStatus = "pending" | "success" | "error" | "skipped"

export type SaveDocStepItem = {
  name: string
  status: SaveDocStepStatus
  error?: string
}

/**
 * True when the version is unpublished — doc generation is an expected skip.
 * VC Stage 1: publication only (`published_at`); never campaign_status.
 */
export function shouldSkipDocsForCampaignStatus(version: {
  publishedAt?: string | null
  published_at?: string | null
} | null | undefined): boolean {
  if (version == null) return true
  return !isVersionPublished(version)
}

/** Alias — prefer this name at new call sites. */
export const shouldSkipDocsForUnpublishedVersion = shouldSkipDocsForCampaignStatus

/** PC3 / persisted-render gate messages that must never look like save failures. */
export function isExpectedDocGateSkipError(message: unknown): boolean {
  const m = String(message ?? "")
  if (!m) return false
  return (
    /approved-or-beyond/i.test(m) ||
    /past Draft/i.test(m) ||
    /Publish this plan/i.test(m) ||
    /approved_slice missing/i.test(m) ||
    /No billing schedule persisted/i.test(m) ||
    /Document render requires/i.test(m) ||
    /Document download requires/i.test(m) ||
    /unpublished/i.test(m) ||
    /published version/i.test(m)
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

export type PublishDocumentsPayload = {
  status: "ok" | "error" | "skipped"
  error?: string
}

/**
 * Map the save-response documents payload onto the Generate documents modal
 * step. A missing payload is an error — that omission is how this stayed
 * silent for six weeks.
 */
export function applyPublishDocumentsStep(
  updateSaveStatus: (
    name: string,
    status: SaveDocStepStatus,
    error?: string,
  ) => void,
  documents?: PublishDocumentsPayload | null,
): void {
  if (!documents) {
    updateSaveStatus(
      DOC_STEP_POSTGRES_GENERATE,
      "error",
      "Document step did not run",
    )
    return
  }
  if (documents.status === "ok") {
    updateSaveStatus(DOC_STEP_POSTGRES_GENERATE, "success")
    return
  }
  if (documents.status === "skipped") {
    updateSaveStatus(
      DOC_STEP_POSTGRES_GENERATE,
      "skipped",
      documents.error ?? DOC_SKIP_REASON,
    )
    return
  }
  updateSaveStatus(
    DOC_STEP_POSTGRES_GENERATE,
    "error",
    documents.error || "Document generation failed",
  )
}

export const DOC_SAVE_DID_NOT_RUN_REASON = "Save did not publish"

/** Keep Generate documents + KPI sync from sitting pending after a failed save. */
export function skipUnrunPostgresSaveSteps(
  updateSaveStatus: (
    name: string,
    status: SaveDocStepStatus,
    error?: string,
  ) => void,
  docReason: string = DOC_SAVE_DID_NOT_RUN_REASON,
): void {
  updateSaveStatus(DOC_STEP_POSTGRES_GENERATE, "skipped", docReason)
  updateSaveStatus("KPI sync", "skipped")
}
