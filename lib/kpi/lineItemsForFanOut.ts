import { sortLineItemsByLineItemNumber } from "@/lib/mediaplan/lineItemIds"
import type { LineItemForKpiFanout } from "./types"

export type KpiLineItemsPair = {
  media?: readonly unknown[] | null
  export?: readonly unknown[] | null
}

function asFanoutLineItems(items: readonly unknown[]): LineItemForKpiFanout[] {
  return items as LineItemForKpiFanout[]
}

/**
 * Prefer API/media-container rows (stable `line_item_id`) over export `LineItem[]`
 * bursts used for Excel totals.
 */
export function pickKpiLineItems(
  mediaLineItems: readonly unknown[] | null | undefined,
  exportLineItems: readonly unknown[] | null | undefined,
): LineItemForKpiFanout[] {
  const media = Array.isArray(mediaLineItems) ? mediaLineItems : []
  const exported = Array.isArray(exportLineItems) ? exportLineItems : []
  const source = asFanoutLineItems(media.length > 0 ? media : exported)
  return sortLineItemsByLineItemNumber<LineItemForKpiFanout>(source)
}

/** Build resolver/fan-out maps keyed by workbook media type (e.g. `digiDisplay`, `ooh`). */
export function buildKpiLineItemsByMediaType(
  pairs: Record<string, KpiLineItemsPair>,
): Record<string, LineItemForKpiFanout[]> {
  return Object.fromEntries(
    Object.entries(pairs).map(([key, pair]) => [
      key,
      pickKpiLineItems(pair?.media, pair?.export),
    ]),
  ) as Record<string, LineItemForKpiFanout[]>
}
