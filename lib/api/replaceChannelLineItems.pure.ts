/**
 * Pure helpers for draft-save channel replace (no env / network imports).
 * Matching uses media_plan_version === id ONLY — never mp_plannumber/version_number.
 */

/**
 * Historical channel-list query params (mba_number plus media_plan_version).
 * Nothing in the app issues that Xano GET anymore.
 * Deletion still uses {@link collectRowsForVersionReplace} (id filter only).
 */
export function buildReplaceListQueryParams(
  mediaPlanVersionId: number,
  mbaNumber: string
): { mba_number: string; media_plan_version: number } {
  return {
    mba_number: String(mbaNumber ?? "").trim(),
    media_plan_version: Number(mediaPlanVersionId),
  }
}

export function matchesMediaPlanVersionId(row: any, mediaPlanVersionId: number): boolean {
  const raw = row?.media_plan_version
  if (raw === undefined || raw === null || String(raw).trim() === "") return false
  return Number(raw) === Number(mediaPlanVersionId)
}

export function collectRowsForVersionReplace(
  rows: any[],
  mediaPlanVersionId: number
): any[] {
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => row?.id != null && matchesMediaPlanVersionId(row, mediaPlanVersionId)
  )
}
