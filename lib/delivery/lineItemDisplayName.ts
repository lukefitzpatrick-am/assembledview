/**
 * Client-facing delivery accordion labels: Platform/Publisher • Targeting.
 * Display-only — never use for id matching, pacing, or Snowflake joins.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

/** First non-empty trimmed string wins. */
function firstText(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return ""
}

function readField(
  item: Record<string, unknown> | null | undefined,
  attrs: Record<string, unknown> | null,
  key: string,
): unknown {
  return item?.[key] ?? attrs?.[key]
}

/**
 * Clamp on a word boundary with a trailing ellipsis. `full` stays unclamped for title= tooltips.
 */
export function clampDisplayLabel(text: string, maxLength: number): string {
  if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) {
    return text
  }
  const ellipsis = "…"
  const budget = Math.max(1, maxLength - ellipsis.length)
  let slice = text.slice(0, budget)
  const lastSpace = slice.lastIndexOf(" ")
  if (lastSpace > 0) {
    slice = slice.slice(0, lastSpace)
  }
  return `${slice.replace(/\s+$/u, "")}${ellipsis}`
}

/**
 * Resolve a human label for a delivery line-item accordion header.
 *
 * Source: platform ?? publisher ?? network ?? site ?? station (flat or attrs).
 * Targeting: attrs.creative_targeting ?? creative_targeting ?? attrs.creative ?? creative.
 * Fallback when both empty: line_item_name ?? lineItemName ?? line_item_id ?? "Line item".
 */
export function deliveryLineItemDisplayName(
  item: Record<string, unknown> | null | undefined,
  opts?: { maxLength?: number },
): { label: string; full: string } {
  const maxLength = opts?.maxLength ?? 90
  const attrs = asRecord(item?.attrs)

  const source = firstText(
    readField(item, attrs, "platform"),
    readField(item, attrs, "publisher"),
    readField(item, attrs, "network"),
    readField(item, attrs, "site"),
    readField(item, attrs, "station"),
  )

  // Prefer attrs.creative_targeting then flat — adapters may receive either shape.
  const targeting = firstText(
    attrs?.creative_targeting,
    item?.creative_targeting,
    attrs?.creative,
    item?.creative,
  )

  const joined = [source, targeting].filter(Boolean).join(" • ")
  const full = joined
    ? joined
    : firstText(item?.line_item_name, item?.lineItemName, item?.line_item_id, item?.lineItemId) ||
      "Line item"

  return {
    full,
    label: clampDisplayLabel(full, maxLength),
  }
}
