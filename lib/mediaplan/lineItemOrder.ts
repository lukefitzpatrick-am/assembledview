import {
  buildLineItemId,
  MEDIA_TYPE_ID_CODES,
  pickLineItemNumber,
  parseLineNumberFromLineItemId,
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
 * Resolve a claimable line number: explicit number field first, else the
 * number embedded in the deterministic line_item_id (e.g. "MBA1DA5" -> 5).
 * Returns null when neither yields a positive integer.
 */
function claimLineNumber(item: LineItemWithIdentity): number | null {
  const n = pickLineItemNumber(item, 0)
  if (n > 0) return n
  for (const id of [item.line_item_id, item.lineItemId]) {
    if (id == null) continue
    const parsed = parseLineNumberFromLineItemId(String(id))
    if (parsed && parsed > 0) return parsed
  }
  return null
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
    const n = claimLineNumber(item)
    if (n != null && !used.has(n)) {
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

type PositionedLine = LineItemWithIdentity & { position?: number | null }

/**
 * Display-order key. `position` is the 0-based `line_items.position` column.
 * A persisted read copies that column onto `line_item`, so a `line_item` that
 * is not the id suffix is the same key. Otherwise the array index is the order.
 */
export function oohPersistedPosition(item: PositionedLine, index: number): number {
  const raw = item.position
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw)
  const id = String(item.line_item_id ?? item.lineItemId ?? "").trim()
  const suffix = id ? parseLineNumberFromLineItemId(id) : null
  const fromField = Number(item.line_item ?? item.lineItem)
  if (
    suffix != null &&
    Number.isFinite(fromField) &&
    Math.trunc(fromField) !== suffix
  ) {
    return Math.trunc(fromField)
  }
  return index
}

/** 1-based "Line N" label. Never the `line_item_id` suffix. */
export function oohLineDisplayNumber(item: object, index: number): number {
  return oohPersistedPosition(item as PositionedLine, index) + 1
}

/** Export / summary order follows position, not the id suffix. */
export function orderOohLinesForExport<T>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      key: oohPersistedPosition(item as PositionedLine, index),
    }))
    .sort((a, b) => (a.key !== b.key ? a.key - b.key : a.index - b.index))
    .map(({ item }) => item)
}

/**
 * OOH expert reorder: keep the id each line was minted with.
 * `position` is the new array order (0-based, same as `line_items.position` on save).
 */
export function keepOohLineIdsOnReorder<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
): Array<T & { position: number }> {
  const stable = assignStableLineItemNumbers(items, mbaNumber, MEDIA_TYPE_ID_CODES.ooh)
  return stable.map((item, index) => ({ ...item, position: index }))
}

/**
 * Editor hydrate. Postgres copies `position` onto `line_item`, so sort by that
 * key first, then put the id suffix back on `line_item` before the stable
 * assign. Otherwise assign would rebuild the id from the display index.
 */
export function prepareOohEditorLines<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
): Array<T & { position: number }> {
  const ordered = orderOohLinesForExport(items)
  const restored = ordered.map((item) => {
    const id = String(item.line_item_id ?? item.lineItemId ?? "").trim()
    const suffix = id ? parseLineNumberFromLineItemId(id) : null
    if (suffix == null) return item
    return { ...item, line_item: suffix, lineItem: suffix }
  })
  return keepOohLineIdsOnReorder(restored, mbaNumber)
}
