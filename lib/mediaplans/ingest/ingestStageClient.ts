/** Same-tab sessionStorage cache of a staged ingest. Server `ingest_stages` is the source of truth. */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"

export const INGEST_STAGE_STORAGE_PREFIX = "av.ingest.stage."

export type ClientStagedIngest = {
  review: IngestReviewPackage
  fileName: string | null
}

export function writeIngestStageToSession(
  stageId: string,
  payload: ClientStagedIngest,
): void {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(
      `${INGEST_STAGE_STORAGE_PREFIX}${stageId}`,
      JSON.stringify(payload),
    )
  } catch {
    // quota / private mode
  }
}

export function readIngestStageFromSession(
  stageId: string,
): ClientStagedIngest | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(`${INGEST_STAGE_STORAGE_PREFIX}${stageId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ClientStagedIngest
    if (!parsed || typeof parsed !== "object" || !parsed.review) return null
    return parsed
  } catch {
    return null
  }
}
