/** Parse Review page — per-row gate. Create and Hub use mba_number=create. */
export function ingestParseReviewPath(
  stageId: string,
  mbaNumber?: string | null,
): string {
  const mba = mbaNumber?.trim() || "create"
  return `/mediaplans/mba/${encodeURIComponent(mba)}/ingest/${encodeURIComponent(stageId)}`
}
