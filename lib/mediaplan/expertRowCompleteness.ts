/**
 * Heuristic incompleteness for expert-grid rows (UX-12).
 * Incomplete = missing a common required select and/or no schedule quantity.
 */

export type ExpertRowCompletenessInput = {
  id?: string
  buyType?: string
  publisher?: string
  platform?: string
  network?: string
  station?: string
  site?: string
  mediaType?: string
  weeklyValues?: Record<string, number | "">
  mergedWeekSpans?: ReadonlyArray<{ totalQty?: number }>
}

function hasQty(row: ExpertRowCompletenessInput): boolean {
  const spans = row.mergedWeekSpans
  if (spans?.some((s) => Number(s.totalQty) > 0)) return true
  const vals = row.weeklyValues
  if (!vals) return false
  for (const v of Object.values(vals)) {
    if (typeof v === "number" && v > 0) return true
  }
  return false
}

function blank(v: unknown): boolean {
  return String(v ?? "").trim() === ""
}

/**
 * Returns human-readable reasons the row is incomplete (empty = complete).
 */
export function expertRowIncompleteReasons(
  row: ExpertRowCompletenessInput
): string[] {
  const reasons: string[] = []
  if ("buyType" in row && blank(row.buyType)) reasons.push("Buy type")
  if ("publisher" in row && blank(row.publisher)) reasons.push("Publisher")
  if ("platform" in row && blank(row.platform)) reasons.push("Platform")
  if ("network" in row && blank(row.network)) reasons.push("Network")
  if ("station" in row && blank(row.station)) reasons.push("Station")
  if ("site" in row && blank(row.site)) reasons.push("Site")
  if ("mediaType" in row && blank(row.mediaType)) reasons.push("Media type")
  if (!hasQty(row)) reasons.push("Schedule quantity ($0 / empty)")
  return reasons
}

export function isExpertRowIncomplete(row: ExpertRowCompletenessInput): boolean {
  return expertRowIncompleteReasons(row).length > 0
}

export function countIncompleteExpertRows(
  rows: ReadonlyArray<ExpertRowCompletenessInput>
): number {
  let n = 0
  for (const r of rows) {
    if (isExpertRowIncomplete(r)) n++
  }
  return n
}
