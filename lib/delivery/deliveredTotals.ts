import { lineIsAssumedSpend } from "@/lib/pacing/direct/assumedSpendLine"

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
  /** True when the digital spend includes a CM360 direct-digital estimate. */
  includesEstimatedSpend?: boolean
}

export type DeliveredTotals = {
  /** Digital delivered spend + fixed-cost `totalReported`, summed. */
  spendToDate: number
  /** Digital impressions only — fixed-cost media (TV/Radio/Newspaper) has no impression metric. */
  impressions: number
  /** True when there is a real, positive delivered figure to show (spend or impressions > 0). */
  hasDelivery: boolean
  /** True when the figure includes CM360 direct-digital estimated spend. */
  includesEstimatedSpend?: boolean
  /**
   * Assumed dollars already inside `spendToDate`. The hub labels this
   * "includes $X assumed" and does not add it again.
   */
  assumedSpend?: number
  /**
   * The part of `assumedSpend` that was in "Booked, no platform delivery".
   * Direct-digital assumed dollars stay in the platform expected figure.
   */
  assumedInBooked?: number
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
  const includesEstimatedSpend = digital?.includesEstimatedSpend === true

  return {
    spendToDate,
    impressions,
    hasDelivery,
    ...(includesEstimatedSpend ? { includesEstimatedSpend: true } : {}),
  }
}

/** Both ISO dates required; otherwise the delivered query stays unbounded. */
export function deliveredQueryWindow(
  startDate?: string | null,
  endDate?: string | null,
): { startDate: string; endDate: string } | null {
  const start = typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null
  const end = typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null
  if (!start || !end) return null
  return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start }
}

/**
 * Ranged: sum `daily[].reportedSpend` whose DATE_DAY is inside the window.
 * Empty `daily[]` while ranged → 0 (no unbounded `totalReported` fallback).
 * Unbounded: `totalReported`.
 */
function skipDirectLine(
  line: { lineItemId?: string },
  excludeLineItemIds?: Set<string> | null,
): boolean {
  if (!excludeLineItemIds || excludeLineItemIds.size === 0) return false
  const id = String(line.lineItemId ?? "").trim().toLowerCase()
  return Boolean(id) && excludeLineItemIds.has(id)
}

export function sumDirectReportedSpendInRange(
  group:
    | {
        totalReported: number
        lineItems?: Array<{
          lineItemId?: string
          totalReported?: number
          daily?: Array<{ dateDay: string; reportedSpend: number }>
        }>
      }
    | null
    | undefined,
  startDate?: string | null,
  endDate?: string | null,
  excludeLineItemIds?: Set<string> | null,
): number {
  if (!group) return 0
  const window = deliveredQueryWindow(startDate, endDate)
  if (!window) {
    if (!excludeLineItemIds || excludeLineItemIds.size === 0) {
      return Number.isFinite(group.totalReported) ? group.totalReported : 0
    }
    let unbounded = 0
    for (const line of group.lineItems ?? []) {
      if (skipDirectLine(line, excludeLineItemIds)) continue
      const lineTotal = Number(line.totalReported)
      if (Number.isFinite(lineTotal)) {
        unbounded += lineTotal
        continue
      }
      for (const day of line.daily ?? []) {
        const n = Number(day.reportedSpend)
        if (Number.isFinite(n)) unbounded += n
      }
    }
    return unbounded
  }
  let sum = 0
  let sawDaily = false
  for (const line of group.lineItems ?? []) {
    if (skipDirectLine(line, excludeLineItemIds)) continue
    if (!Array.isArray(line.daily) || line.daily.length === 0) continue
    sawDaily = true
    for (const day of line.daily) {
      if (day.dateDay < window.startDate || day.dateDay > window.endDate) continue
      const n = Number(day.reportedSpend)
      if (Number.isFinite(n)) sum += n
    }
  }
  return sawDaily ? sum : 0
}

/** Snapshot lines that already carry REPORTED_SPEND overlay — exclude them from the Direct sum. */
const OVERLAY_SPEND_SNAPSHOT_GROUPS = new Set([
  "programmatic_display",
  "programmatic_video",
  "programmatic_ooh",
  "digital_display",
  "digital_video",
  "digital_audio",
  "bvod",
])

export function programmaticLineItemIdsFromSnapshot(
  snapshot:
    | {
        channels?: Array<{
          group: string
          lines?: Array<{ lineItemId: string }>
        }>
      }
    | null
    | undefined,
): Set<string> {
  const ids = new Set<string>()
  for (const channel of snapshot?.channels ?? []) {
    if (!OVERLAY_SPEND_SNAPSHOT_GROUPS.has(channel.group)) continue
    for (const line of channel.lines ?? []) {
      const id = String(line.lineItemId ?? "").trim().toLowerCase()
      if (id) ids.add(id)
    }
  }
  return ids
}

/** Clamp snapshot as-of to the range end when the range ends before today. */
export function asOfForDeliveredRange(snapshotAsOf: string, rangeEnd?: string | null): string {
  if (!rangeEnd) return snapshotAsOf
  return rangeEnd < snapshotAsOf ? rangeEnd : snapshotAsOf
}

/**
 * Whether a delivered figure has a *real, reported* spend to show as a dollar amount —
 * independent of `hasDelivery`, which is also `true` for impressions-only delivery (digital
 * media that has started serving but not yet reported spend). Consumers displaying a delivered
 * spend figure (not just the "has delivery" state) must gate on this, not `hasDelivery`, so an
 * impressions-only campaign never renders a fabricated "$0 delivered" instead of "not yet
 * reported".
 */
export function hasReportedDeliveredSpend(spendToDate: number | null | undefined): boolean {
  return typeof spendToDate === "number" && Number.isFinite(spendToDate) && spendToDate > 0
}

/**
 * Settled "no delivery yet" payload with an `asOf` field — used by client-side fetchers (e.g.
 * `ClientDashboardPageContent`) to resolve a failed/non-OK delivered-totals fetch to a real,
 * settled value instead of leaving state `undefined` forever (which would spin a loading
 * skeleton indefinitely). Never treat this as "delivered $0" — `hasDelivery` is `false`.
 */
export const EMPTY_DELIVERED_TOTALS_WITH_AS_OF: DeliveredTotals & { asOf: string } = {
  spendToDate: 0,
  impressions: 0,
  hasDelivery: false,
  asOf: "",
}

/** Sums multiple already-combined `DeliveredTotals` (e.g. across campaigns for a client KPI). */
export function sumDeliveredTotals(totals: DeliveredTotals[]): DeliveredTotals {
  const spendToDate = totals.reduce((sum, t) => sum + (Number.isFinite(t.spendToDate) ? t.spendToDate : 0), 0)
  const impressions = totals.reduce((sum, t) => sum + (Number.isFinite(t.impressions) ? t.impressions : 0), 0)
  const hasDelivery = totals.some((t) => t.hasDelivery)
  const includesEstimatedSpend = totals.some((t) => t.includesEstimatedSpend === true)
  const assumedSpend = totals.reduce(
    (sum, t) => sum + (Number.isFinite(t.assumedSpend) ? Number(t.assumedSpend) : 0),
    0,
  )
  const assumedInBooked = totals.reduce(
    (sum, t) => sum + (Number.isFinite(t.assumedInBooked) ? Number(t.assumedInBooked) : 0),
    0,
  )
  return {
    spendToDate,
    impressions,
    hasDelivery,
    ...(includesEstimatedSpend ? { includesEstimatedSpend: true } : {}),
    ...(assumedSpend > 0 ? { assumedSpend, assumedInBooked } : {}),
  }
}

function finiteSpend(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

type DirectSpendLine = {
  lineItemId?: string
  totalReported?: number
  daily?: Array<{ dateDay: string; reportedSpend: number; capApplied?: string }>
}

function lineReportedSpend(
  line: DirectSpendLine,
  window: { startDate: string; endDate: string } | null,
): number {
  if (!window) {
    const lineTotal = Number(line.totalReported)
    if (Number.isFinite(lineTotal)) return lineTotal
    let sum = 0
    for (const day of line.daily ?? []) {
      const n = Number(day.reportedSpend)
      if (Number.isFinite(n)) sum += n
    }
    return sum
  }
  if (!Array.isArray(line.daily) || line.daily.length === 0) return 0
  let sum = 0
  for (const day of line.daily) {
    if (day.dateDay < window.startDate || day.dateDay > window.endDate) continue
    const n = Number(day.reportedSpend)
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

/**
 * Assumed dollars inside a direct group.
 * `included` is already in `sumDirectReportedSpendInRange` (not an overlay line).
 * `omitted` is an overlay line whose snapshot spend is still 0, so the caller adds it once.
 */
export function splitAssumedDirectSpend(
  group: { lineItems?: DirectSpendLine[] } | null | undefined,
  startDate?: string | null,
  endDate?: string | null,
  excludeLineItemIds?: Set<string> | null,
  snapshotSpendById?: ReadonlyMap<string, number> | null,
): { included: number; omitted: number } {
  const window = deliveredQueryWindow(startDate, endDate)
  let included = 0
  let omitted = 0
  for (const line of group?.lineItems ?? []) {
    const daily = (line.daily ?? []).map((day) => ({ capApplied: String(day.capApplied ?? "") }))
    if (!lineIsAssumedSpend({ daily })) continue
    const amount = lineReportedSpend(line, window)
    if (!(amount > 0)) continue
    const id = String(line.lineItemId ?? "").trim().toLowerCase()
    const excluded = Boolean(id) && Boolean(excludeLineItemIds?.has(id))
    if (!excluded) {
      included += amount
      continue
    }
    const already = snapshotSpendById?.get(id) ?? 0
    if (!(already > 0)) omitted += amount
  }
  return { included, omitted }
}

export function directSpendWithAssumed(
  group: Parameters<typeof sumDirectReportedSpendInRange>[0],
  startDate?: string | null,
  endDate?: string | null,
  excludeLineItemIds?: Set<string> | null,
  snapshotSpendById?: ReadonlyMap<string, number> | null,
): { spend: number; assumedSpend: number; assumedInBooked: number } {
  const base = sumDirectReportedSpendInRange(group, startDate, endDate, excludeLineItemIds)
  const split = splitAssumedDirectSpend(
    group,
    startDate,
    endDate,
    excludeLineItemIds,
    snapshotSpendById,
  )
  return {
    spend: base + split.omitted,
    assumedSpend: split.included + split.omitted,
    assumedInBooked: split.included,
  }
}

/**
 * App-side assumed spend for lines Snowflake has not written yet.
 * A positive Snowflake assumed row already counted by directSpendWithAssumed is left alone.
 */
export function snapshotAssumedSupplement(
  snapshot:
    | {
        channels?: Array<{
          group?: string
          lines?: Array<{ lineItemId?: string; spendToDate?: number }>
        }>
      }
    | null
    | undefined,
  group: { lineItems?: DirectSpendLine[] } | null | undefined,
): number {
  const covered = new Set<string>()
  for (const line of group?.lineItems ?? []) {
    const daily = (line.daily ?? []).map((day) => ({ capApplied: String(day.capApplied ?? "") }))
    if (!lineIsAssumedSpend({ daily })) continue
    if (!(lineReportedSpend(line, null) > 0)) continue
    const id = String(line.lineItemId ?? "").trim().toLowerCase()
    if (id) covered.add(id)
  }
  let extra = 0
  for (const channel of snapshot?.channels ?? []) {
    if (channel.group !== "assumed_spend") continue
    for (const line of channel.lines ?? []) {
      const id = String(line.lineItemId ?? "").trim().toLowerCase()
      if (id && covered.has(id)) continue
      extra += finiteSpend(line.spendToDate)
    }
  }
  return extra
}

export function snapshotSpendByLineId(
  snapshot:
    | {
        channels?: Array<{
          lines?: Array<{ lineItemId?: string; spendToDate?: number }>
        }>
      }
    | null
    | undefined,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const channel of snapshot?.channels ?? []) {
    for (const line of channel.lines ?? []) {
      const id = String(line.lineItemId ?? "").trim().toLowerCase()
      if (!id) continue
      map.set(id, finiteSpend(line.spendToDate))
    }
  }
  return map
}

/**
 * Delivered already contains `assumedSpend`. Booked falls by `assumedInBooked`
 * (the same amount when every assumed dollar was non-platform). Neither figure
 * receives those dollars a second time.
 */
export function applyAssumedToHubTotals(args: {
  deliveredSpend: number
  bookedNoPlatform?: number | null
  assumedSpend: number
  assumedInBooked?: number
}): { deliveredSpend: number; bookedNoPlatform: number | null; assumedSpend: number } {
  const assumedSpend = Math.max(0, finiteSpend(args.assumedSpend))
  const assumedInBooked =
    args.assumedInBooked == null ? assumedSpend : Math.max(0, finiteSpend(args.assumedInBooked))
  const booked =
    args.bookedNoPlatform == null || !Number.isFinite(args.bookedNoPlatform)
      ? null
      : Math.max(0, args.bookedNoPlatform - assumedInBooked)
  return {
    deliveredSpend: finiteSpend(args.deliveredSpend),
    bookedNoPlatform: booked,
    assumedSpend,
  }
}

const FIXED_COST_MEDIA_TYPE_KEYS = new Set([
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digital display",
  "digital video",
  "digital audio",
  "bvod",
  "digitaldisplay",
  "digidisplay",
  "digitalvideo",
  "digivideo",
  "digitalaudio",
  "digiaudio",
  "digibvod",
])

/**
 * Whether a campaign's line-item map has offline, magazine, OOH, cinema, or
 * direct-digital lines. Those campaigns read the fixed-cost daily fact, which
 * also holds assumed-spend rows. Search, social, and programmatic maps do not.
 */
export function hasFixedCostMediaLineItems(
  lineItemsMap: Record<string, unknown[] | undefined> | null | undefined,
): boolean {
  if (!lineItemsMap || typeof lineItemsMap !== "object") return false
  const keys = new Set([
    ...FIXED_COST_MEDIA_TYPE_KEYS,
    "digitalDisplay",
    "digiDisplay",
    "digitalVideo",
    "digiVideo",
    "digitalAudio",
    "digiAudio",
    "digiBvod",
    "digi_bvod",
  ])
  for (const key of keys) {
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
  return mediaTypes.some((m) => {
    if (typeof m !== "string") return false
    return FIXED_COST_MEDIA_TYPE_KEYS.has(m.trim().toLowerCase())
  })
}
