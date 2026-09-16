import {
  cleanPacingLineItemId,
  extractPacingLineItemIdFromItem,
} from "@/lib/pacing/delivery/lineItemIds"

type FactRow = {
  channel?: string | null
  lineItemId?: string | null
}

/**
 * Mapped prog_ooh lines with PACING_FACT `programmatic-ooh` rows render in the
 * Programmatic OOH adapter. Mapped lines with no matching rows stay in
 * Awaiting delivery. A live OOH line is never also in the remainder.
 */
export function partitionProgOohDeliveryLines<T>(
  items: T[],
  rows: FactRow[],
): { live: T[]; awaiting: T[] } {
  const idsWithRows = new Set<string>()
  for (const row of rows) {
    const channel = String(row.channel ?? "").toLowerCase()
    if (channel !== "programmatic-ooh" && channel !== "programmatic - ooh") continue
    const id = cleanPacingLineItemId(row.lineItemId)
    if (id) idsWithRows.add(id)
  }

  const live: T[] = []
  const awaiting: T[] = []
  for (const item of items) {
    const id = extractPacingLineItemIdFromItem(item as Record<string, unknown>)
    if (id && idsWithRows.has(id)) live.push(item)
    else awaiting.push(item)
  }
  return { live, awaiting }
}
