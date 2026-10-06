import { sortLineItemsByLineItemNumber } from '@/lib/mediaplan/lineItemIds';

/**
 * Filters line items to ensure they match both mba_number AND (version_number OR mp_plannumber)
 * This ensures we check ALL entries and match items regardless of which version field is used
 */
export function filterLineItemsByPlanNumber(
  data: any[],
  mbaNumber: string,
  versionNumber: string,
  mediaType: string
): any[] {
  const requestedVersion = String(versionNumber ?? "").trim()
  const requestedMba = String(mbaNumber ?? "").trim()

  // Normalize version number for comparison (handle both string and number)
  const filteredData = data.filter((item: any) => {
    const itemMba = String(item.mba_number ?? item.mbaNumber ?? "").trim()

    const versionCandidates = [
      item.media_plan_version,
      item.media_plan_version_number,
      item.version_number,
      item.versionNumber,
      item.mp_plannumber,
      item.mp_plan_number,
    ]

    const versionMatch = versionCandidates.some((value) => String(value ?? "").trim() === requestedVersion)
    const mbaMatch = itemMba === requestedMba

    return versionMatch && mbaMatch
  })

  if (filteredData.length !== data.length) {
    // Avoid per-item log spam when callers accidentally over-fetch many historic versions.
    console.warn(
      `[${mediaType}] Warning: ${data.length - filteredData.length} items were filtered out. Only items matching both mba_number and version are returned.`
    )
    console.log(
      `[${mediaType}] Kept ${filteredData.length} items matching mba_number=${requestedMba} and version=${requestedVersion}`
    )
  }

  return sortLineItemsByLineItemNumber(filteredData);
}
