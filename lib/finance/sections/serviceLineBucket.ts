/**
 * FN-FIX-1 — `__service__*` schedule months are campaign-level synthetics
 * (adserving / fees / production / media_total) with no line_items row.
 * They must never be attributed into publisher / channel / buyType cuts.
 */

export const SERVICE_LINE_ID_PREFIX = "__service__"

/**
 * Wire / SQL bucket key — stable for totals identity. UI labels via
 * {@link CAMPAIGN_LEVEL_DISPLAY_LABEL} (FIN-8 display-only).
 */
export const CAMPAIGN_LEVEL_NO_LINE_DETAIL = "campaign-level (no line detail)"

/** User-facing label for {@link CAMPAIGN_LEVEL_NO_LINE_DETAIL} rows (FIN-8). */
export const CAMPAIGN_LEVEL_DISPLAY_LABEL = "Campaign totals (no line breakdown)"

/** Short tooltip / footnote for campaign-totals rows (FIN-8). */
export const CAMPAIGN_LEVEL_USER_NOTE =
  "Campaign-level fee, adserving, or production totals without a publisher or channel line. They are not attributed to a publisher."

export function isServiceLineItemId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SERVICE_LINE_ID_PREFIX)
}

export function isCampaignLevelBucket(value: unknown): boolean {
  return value === CAMPAIGN_LEVEL_NO_LINE_DETAIL
}

/** Map wire bucket key → display label; other values pass through as strings. */
export function formatCampaignLevelLabel(value: unknown): string {
  if (isCampaignLevelBucket(value)) return CAMPAIGN_LEVEL_DISPLAY_LABEL
  if (value == null || value === "") return "—"
  return String(value)
}

/** SQL boolean: schedule cell is a campaign-level synthetic. */
export const IS_SERVICE_LINE_SQL = `(sm.line_item_id LIKE '${SERVICE_LINE_ID_PREFIX}%')`

/**
 * Wrap a line-level dimension expression so `__service__*` rows bucket into
 * {@link CAMPAIGN_LEVEL_NO_LINE_DETAIL} instead of Unknown / Unspecified.
 */
export function lineDimOrCampaignLevelSql(lineLevelExpr: string): string {
  return `CASE
  WHEN ${IS_SERVICE_LINE_SQL} THEN '${CAMPAIGN_LEVEL_NO_LINE_DETAIL}'
  ELSE (${lineLevelExpr})
END`
}

/** Shared coverage note for lineDetailPct (API / developers). */
export const LINE_DETAIL_COVERAGE_NOTE =
  "lineDetailPct = % of schedule $ on non-__service__ line_item_ids (joined line detail). Remainder is campaign-level (no line detail) — fee/adserving/production synthetics; never attributed in publisher/channel/buyType cuts."
