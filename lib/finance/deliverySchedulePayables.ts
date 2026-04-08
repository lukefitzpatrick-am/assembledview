/**
 * Normalises delivery-schedule line JSON for payables and related finance paths:
 * agency-owed unless the line explicitly marks client-paid (`clientPaysForMedia` or `client_pays_for_media` strictly `true`).
 */
export function deliveryLineItemClientPaysForMedia(
  li: Record<string, unknown> | null | undefined
): boolean {
  if (!li || typeof li !== "object") return false
  const o = li as Record<string, unknown>
  return o.clientPaysForMedia === true || o.client_pays_for_media === true
}
