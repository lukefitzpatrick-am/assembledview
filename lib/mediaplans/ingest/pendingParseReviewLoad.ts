/**
 * Same-tab hand-off from Parse Review Load → create/edit form.
 * The form door stays ingestReviewToFormLineItems / applyIngestLineItemsLoad.
 */

import type { AutopopulateChannel } from "@/lib/ava/autopopulate/types"

export const PENDING_PARSE_REVIEW_LOAD_KEY = "av.ingest.pending-parse-review-load"

export type PendingParseReviewLoad = {
  channel: AutopopulateChannel
  items: Record<string, unknown>[]
  replace: boolean
  ingestStageId: string
}

export function writePendingParseReviewLoad(
  payload: PendingParseReviewLoad,
): void {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(PENDING_PARSE_REVIEW_LOAD_KEY, JSON.stringify(payload))
  } catch {
    // quota / private mode
  }
}

export function consumePendingParseReviewLoad(): PendingParseReviewLoad | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(PENDING_PARSE_REVIEW_LOAD_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_PARSE_REVIEW_LOAD_KEY)
    const parsed = JSON.parse(raw) as PendingParseReviewLoad
    if (!parsed || typeof parsed !== "object") return null
    if (!Array.isArray(parsed.items) || !parsed.ingestStageId) return null
    if (parsed.channel !== "ooh" && parsed.channel !== "radio") return null
    return parsed
  } catch {
    return null
  }
}
