/** Shared pacing line-item id helpers (used by delivery UI + Ava tools). */

export function cleanPacingLineItemId(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase()
  if (!s || s === "undefined" || s === "null") return null
  return s
}

export function extractPacingLineItemIdFromItem(item: unknown): string | null {
  const row = item as Record<string, unknown>
  const id = row?.line_item_id ?? row?.lineItemId ?? row?.LINE_ITEM_ID
  return cleanPacingLineItemId(id)
}
