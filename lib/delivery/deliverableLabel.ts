/**
 * Client-facing deliverable card nouns.
 * buyType → label (aggregate/container titles) and metric-key → label (per-line helpers).
 * Display-only — never change pacing maths here.
 */

const BUY_TYPE_LABELS: Record<string, string> = {
  cpm: "Impressions",
  bonus: "Impressions",
  package_inclusions: "Impressions",
  cpc: "Clicks",
  cpv: "Views",
  spots: "Spots",
  insertions: "Insertions",
  panels: "Panels",
  package: "Deliverables",
  fixed_cost: "Deliverables",
  // REVIEW: cpp → "TARPs" is Australian TV/radio cost-per-point convention (6 rows in Supabase);
  // not verified against a codebase constant — confirm with Luke before relying on it.
  cpp: "TARPs",
}

/** Metric keys already resolved by social/programmatic deliverable derivation. */
const METRIC_KEY_LABELS: Record<string, string> = {
  clicks: "Clicks",
  results: "Conversions",
  conversions: "Conversions",
  video_3s_views: "Video Views",
  videoViews: "Video Views",
  impressions: "Impressions",
}

export function deliverableLabelForBuyType(buyType: string | null | undefined): string {
  if (buyType == null) return "Deliverable"
  const key = String(buyType).trim().toLowerCase()
  if (!key) return "Deliverable"
  return BUY_TYPE_LABELS[key] ?? "Deliverable"
}

/**
 * Container roll-up title noun: one shared buy-type label, else "Deliverable".
 */
export function aggregateDeliverableLabel(
  buyTypes: Array<string | null | undefined>,
): string {
  const labels = new Set<string>()
  for (const bt of buyTypes) {
    if (bt == null) continue
    const trimmed = String(bt).trim()
    if (!trimmed) continue
    labels.add(deliverableLabelForBuyType(trimmed))
  }
  if (labels.size === 1) return labels.values().next().value as string
  return "Deliverable"
}

/**
 * Label for a resolved deliverable metric key (impressions/clicks/…).
 * Used by social/programmatic helpers — not a buy-type map.
 */
export function deliverableLabelForMetricKey(key: string | null | undefined): string {
  if (key == null) return "Impressions"
  const k = String(key).trim()
  if (!k) return "Impressions"
  return METRIC_KEY_LABELS[k] ?? "Impressions"
}
