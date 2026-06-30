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
