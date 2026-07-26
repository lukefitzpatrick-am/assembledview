/**
 * Delivered-to-date composition (dashboard Task 3).
 *
 * "Delivered" combines TWO independent Snowflake-backed sources that already exist on this
 * branch — this module does not introduce a new query path, only combines their outputs:
 *   - Digital delivery (social / search / programmatic / ad-serving) via `loadDeliverySnapshot`
 *     (`lib/delivery/loadDeliverySnapshot.ts` → SOCIAL_PACING_TABLE / PACING_FACT / search pacing).
 *   - Fixed-cost delivery (Newspaper / Television / Radio) via `fetchDirectPacingRows`
 *     (`lib/pacing/direct/fetchDirectPacingRows.ts` → FIXED_COST_LINE_ITEM_FACT), using
 *     `totalReported` (finance-smoothed spend) — the same figure already shown as the primary
 *     spend column on `/pacing/direct` (`DirectCampaignsTable`).
 *
 * `loadDeliverySnapshot` never touches FIXED_COST_LINE_ITEM_FACT (`collectChannelPlans` only
 * groups social/progDisplay/progVideo/adServing/search), so direct-media-only campaigns would
 * otherwise show $0 delivered despite real fixed-cost spend — this is the bug Task 3 fixes.
 */

export type DigitalDeliveryTotals = {
  spendToDate: number
  impressions: number
}

export type DeliveredTotals = {
  /** Digital delivered spend + fixed-cost `totalReported`, summed. */
  spendToDate: number
  /** Digital impressions only — fixed-cost media (TV/Radio/Newspaper) has no impression metric. */
  impressions: number
  /** True when there is a real, positive delivered figure to show (spend or impressions > 0). */
  hasDelivery: boolean
}

/**
 * Combines digital delivery totals with fixed-cost delivered spend into one figure.
 * Pure function — no I/O, safe to unit test without Snowflake/Xano mocks.
 */
export function combineDeliveredTotals(
  digital: DigitalDeliveryTotals | null | undefined,
  fixedCostSpend: number | null | undefined,
): DeliveredTotals {
  const digitalSpend =
    typeof digital?.spendToDate === "number" && Number.isFinite(digital.spendToDate)
      ? digital.spendToDate
      : 0
  const impressions =
    typeof digital?.impressions === "number" && Number.isFinite(digital.impressions)
      ? digital.impressions
      : 0
  const fixedSpend =
    typeof fixedCostSpend === "number" && Number.isFinite(fixedCostSpend) ? fixedCostSpend : 0

  const spendToDate = digitalSpend + fixedSpend
  const hasDelivery = spendToDate > 0 || impressions > 0

  return { spendToDate, impressions, hasDelivery }
}

/** Sums multiple already-combined `DeliveredTotals` (e.g. across campaigns for a client KPI). */
export function sumDeliveredTotals(totals: DeliveredTotals[]): DeliveredTotals {
  const spendToDate = totals.reduce((sum, t) => sum + (Number.isFinite(t.spendToDate) ? t.spendToDate : 0), 0)
  const impressions = totals.reduce((sum, t) => sum + (Number.isFinite(t.impressions) ? t.impressions : 0), 0)
  const hasDelivery = totals.some((t) => t.hasDelivery)
  return { spendToDate, impressions, hasDelivery }
}

const FIXED_COST_MEDIA_TYPE_KEYS = new Set(["television", "radio", "newspaper"])

/**
 * Whether a campaign's line-item map (`campaignData.lineItems` — keys from
 * `MEDIA_CONTAINER_ENDPOINTS`) has any fixed-cost media, so callers can skip the
 * `fetchDirectPacingRows` Snowflake read entirely for purely-digital campaigns.
 */
export function hasFixedCostMediaLineItems(
  lineItemsMap: Record<string, unknown[] | undefined> | null | undefined,
): boolean {
  if (!lineItemsMap || typeof lineItemsMap !== "object") return false
  for (const key of FIXED_COST_MEDIA_TYPE_KEYS) {
    const items = lineItemsMap[key]
    if (Array.isArray(items) && items.length > 0) return true
  }
  return false
}

/**
 * Same fixed-cost detection as `hasFixedCostMediaLineItems`, but from the Xano dashboard
 * campaign-list `mediaTypes` labels (e.g. "Television") rather than a media-container
 * line-items map — used by `getDeliveredTotalsForClient`, which only has the former available
 * (the dashboard campaign list never fetches per-campaign line items).
 */
export function hasFixedCostMediaTypeLabel(mediaTypes: string[] | null | undefined): boolean {
  if (!Array.isArray(mediaTypes)) return false
  return mediaTypes.some((m) => typeof m === "string" && FIXED_COST_MEDIA_TYPE_KEYS.has(m.trim().toLowerCase()))
}
