import {
  buildLineItemId,
  MEDIA_TYPE_ID_CODES,
  pickLineItemNumber,
} from "@/lib/mediaplan/lineItemIds"

export interface LineItemWithIdentity {
  line_item_id?: string
  lineItemId?: string
  line_item?: number | string
  lineItem?: number | string
}

type MediaCode = (typeof MEDIA_TYPE_ID_CODES)[keyof typeof MEDIA_TYPE_ID_CODES]

/**
 * Reassign `line_item` / `line_item_id` sequentially (1…n) from array order.
 */
export function reassignLineItemNumbers<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
  mediaTypeCode: MediaCode,
): T[] {
  const mba = (mbaNumber ?? "").trim()
  return items.map((item, index) => {
    const lineNo = index + 1
    const line_item_id = mba
      ? buildLineItemId(mba, mediaTypeCode, lineNo)
      : String(
          item.line_item_id ??
            item.lineItemId ??
            pickLineItemNumber(item, lineNo),
        ).trim()
    return {
      ...item,
      line_item: lineNo,
      lineItem: lineNo,
      line_item_id,
      lineItemId: line_item_id,
    }
  })
}

/**
 * Path A: assign STABLE, UNIQUE line numbers.
 * - Each item with a valid existing line number keeps it (first occurrence wins).
 * - Items with no number, or a number already claimed by an earlier item, get the
 *   next number strictly ABOVE the current max (never reuse a deleted gap).
 * - line_item_id is rebuilt deterministically from the final stable number.
 * Unlike reassignLineItemNumbers (positional 1..n), this preserves existing identity,
 * so deleting/reordering does not churn downstream ids.
 */
export function assignStableLineItemNumbers<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
  mediaTypeCode: MediaCode,
): T[] {
  const mba = (mbaNumber ?? "").trim()
  const used = new Set<number>()

  // Pass 1: claim valid, not-yet-used existing numbers (first occurrence wins).
  const claimed: Array<number | null> = items.map((item) => {
    const n = pickLineItemNumber(item, 0)
    if (n > 0 && !used.has(n)) {
      used.add(n)
      return n
    }
    return null
  })

  // Pass 2: new/colliding items get numbers strictly above the current max.
  let next = (used.size ? Math.max(...used) : 0) + 1
  const finalNumbers = claimed.map((n) => {
    if (n !== null) return n
    const assigned = next++
    used.add(assigned)
    return assigned
  })

  // Rebuild deterministic ids from the stable numbers.
  return items.map((item, i) => {
    const lineNo = finalNumbers[i]
    const line_item_id = mba
      ? buildLineItemId(mba, mediaTypeCode, lineNo)
      : String(item.line_item_id ?? item.lineItemId ?? lineNo).trim()
    return {
      ...item,
      line_item: lineNo,
      lineItem: lineNo,
      line_item_id,
      lineItemId: line_item_id,
    }
  })
}

export function normalizeLineItemsForSave<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
  mediaTypeCode: MediaCode,
): T[] {
  return reassignLineItemNumbers(items, mbaNumber, mediaTypeCode)
}

export function reassignOohLineItemNumbers<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
): T[] {
  return reassignLineItemNumbers(items, mbaNumber, MEDIA_TYPE_ID_CODES.ooh)
}

export function reassignDigiDisplayLineItemNumbers<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
): T[] {
  return reassignLineItemNumbers(items, mbaNumber, MEDIA_TYPE_ID_CODES.digitalDisplay)
}
