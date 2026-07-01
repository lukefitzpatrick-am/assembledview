import { buildLineItemId, MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"

type MediaTypeIdCode = (typeof MEDIA_TYPE_ID_CODES)[keyof typeof MEDIA_TYPE_ID_CODES]

export function resolveBillingBurstLineItemId(
  lineItem: unknown,
  mbaNumber: string | undefined,
  mediaTypeCode: MediaTypeIdCode,
  lineItemIndex: number,
): string {
  const item = lineItem as { line_item_id?: unknown; lineItemId?: unknown }
  const stored = String(item.line_item_id ?? item.lineItemId ?? "").trim()
  if (stored) return stored

  return buildLineItemId(mbaNumber, mediaTypeCode, lineItemIndex + 1)
}
