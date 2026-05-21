/** Query params for Xano line-item list endpoints; include version when known to reduce over-fetching. */
export function lineItemPaginationParams(
  mbaNumber: string,
  versionNumber: string | null | undefined
): Record<string, string> {
  const params: Record<string, string> = { mba_number: mbaNumber }
  if (versionNumber != null && String(versionNumber).trim() !== "") {
    const v = String(versionNumber)
    params.mp_plannumber = v
    params.version_number = v
    params.media_plan_version = v
  }
  return params
}
