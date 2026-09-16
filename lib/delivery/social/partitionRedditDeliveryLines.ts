import type { SocialLineItem } from "./socialChannelCompute"
import {
  cleanPacingLineItemId,
  extractPacingLineItemIdFromItem,
} from "@/lib/pacing/delivery/lineItemIds"

type FactRow = {
  channel?: string | null
  lineItemId?: string | null
}

/**
 * Reddit lines with SOCIAL_PACING_FACT rows render in the Reddit adapter.
 * Reddit lines with no matching reddit rows stay in Awaiting delivery.
 * A live Reddit line is never also in the remainder.
 */
export function partitionRedditDeliveryLines(
  items: SocialLineItem[],
  rows: FactRow[],
): { live: SocialLineItem[]; awaiting: SocialLineItem[] } {
  const idsWithRows = new Set<string>()
  for (const row of rows) {
    if (String(row.channel ?? "").toLowerCase() !== "reddit") continue
    const id = cleanPacingLineItemId(row.lineItemId)
    if (id) idsWithRows.add(id)
  }

  const live: SocialLineItem[] = []
  const awaiting: SocialLineItem[] = []
  for (const item of items) {
    const id = extractPacingLineItemIdFromItem(item)
    if (id && idsWithRows.has(id)) live.push(item)
    else awaiting.push(item)
  }
  return { live, awaiting }
}
