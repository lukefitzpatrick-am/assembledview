/**
 * Expected delivery for the selected time frame on the client campaign dashboard.
 *
 * Every pacing comparison (status pill, progress bar, % figure, variance and
 * card text) compares delivered against what was expected for the selected
 * window, never against the whole-campaign total. Spend and every deliverable
 * use the same window.
 *
 * - "To date" is yesterday in Melbourne, capped at the campaign end. No
 *   delivery is expected for the current day.
 * - A date filter narrows the window. A filter that runs past yesterday stops
 *   at yesterday.
 * - Burst days are Sydney civil days (`parseBurstsToNormalised`).
 * - All date maths is on `YYYY-MM-DD` strings. No `toISOString` day keys from
 *   local `Date`s.
 *
 * Charts are not windowed here. `lib/delivery/lineChartWindow.ts` keeps
 * running them to today.
 */

import { getMelbourneYesterdayISO } from "@/lib/dates/melbourne"
import {
  feePctForScheduleMedia,
  positiveVersionId,
  versionIdFromLine,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"
import { localDateISO } from "@/lib/delivery/lineChartWindow"
import { netBurstMediaForPacing } from "@/lib/pacing/detail/netBurstMediaForPacing"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import { deliveryStatusFromPct, type DeliveryStatus } from "@/lib/pacing/deliveryStatusFromPct"
import type { NormalisedBurst } from "@/lib/pacing/campaigns/types"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export type PacingWindow = {
  /** First day of the window (inclusive). */
  startISO: string
  /** Last day of the window (inclusive). */
  endISO: string
  /** True when a date filter narrows the window below the whole campaign. */
  filtered: boolean
  /** True when nothing is expected yet (window ends before it starts). */
  empty: boolean
}

export type PacingFilterRange = { start: Date | null; end: Date | null }

function isoDay(value: unknown): string | null {
  const text = String(value ?? "").trim().slice(0, 10)
  return ISO_DAY.test(text) ? text : null
}

function dayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  return Math.round(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000)
}

function minISO(...values: Array<string | null | undefined>): string | null {
  let out: string | null = null
  for (const v of values) {
    if (!v) continue
    if (out == null || v < out) out = v
  }
  return out
}

function maxISO(...values: Array<string | null | undefined>): string | null {
  let out: string | null = null
  for (const v of values) {
    if (!v) continue
    if (out == null || v > out) out = v
  }
  return out
}

/** Yesterday in Melbourne, capped at the campaign end. */
export function pacingAsAtISO(campaignEndISO: string | null | undefined, reference?: Date): string {
  const yesterday = getMelbourneYesterdayISO(reference)
  const end = isoDay(campaignEndISO)
  return end && end < yesterday ? end : yesterday
}

/**
 * The window every pacing comparison uses.
 * start = max(campaign start, filter start); end = min(campaign end, filter end, as at).
 * `asAtISO` defaults to `pacingAsAtISO(campaignEndISO)` (Melbourne yesterday).
 */
export function resolvePacingWindow(input: {
  filterRange?: PacingFilterRange | null
  campaignStartISO: string | null | undefined
  campaignEndISO: string | null | undefined
  asAtISO?: string | null
}): PacingWindow {
  return resolvePacingWindowISO({
    filterStartISO: input.filterRange?.start ? localDateISO(input.filterRange.start) : null,
    filterEndISO: input.filterRange?.end ? localDateISO(input.filterRange.end) : null,
    campaignStartISO: input.campaignStartISO,
    campaignEndISO: input.campaignEndISO,
    asAtISO: input.asAtISO,
  })
}

/**
 * `resolvePacingWindow` for callers holding the filter as `YYYY-MM-DD`
 * strings (the `startDate` / `endDate` URL params on the server).
 * The filter applies only when both ends are valid days.
 */
export function resolvePacingWindowISO(input: {
  filterStartISO?: string | null
  filterEndISO?: string | null
  campaignStartISO: string | null | undefined
  campaignEndISO: string | null | undefined
  asAtISO?: string | null
  reference?: Date
}): PacingWindow {
  const campaignStart = isoDay(input.campaignStartISO)
  const campaignEnd = isoDay(input.campaignEndISO)
  const asAt = isoDay(input.asAtISO) ?? pacingAsAtISO(campaignEnd, input.reference)
  const rawStart = isoDay(input.filterStartISO)
  const rawEnd = isoDay(input.filterEndISO)
  const hasFilter = Boolean(rawStart && rawEnd)
  // A reversed filter reads as the same days in order.
  const filterStart = hasFilter ? (rawStart! <= rawEnd! ? rawStart : rawEnd) : null
  const filterEnd = hasFilter ? (rawStart! <= rawEnd! ? rawEnd : rawStart) : null

  const startISO = maxISO(campaignStart, hasFilter ? filterStart : null) ?? "1970-01-01"
  const endISO = minISO(campaignEnd, hasFilter ? filterEnd : null, asAt) ?? asAt
  const filtered =
    hasFilter &&
    ((campaignStart != null && filterStart! > campaignStart) ||
      (campaignEnd != null && filterEnd! < campaignEnd))
  return { startISO, endISO, filtered, empty: endISO < startISO }
}

/** True when `dateISO` falls inside the window. */
export function inPacingWindow(dateISO: string | null | undefined, window: PacingWindow): boolean {
  const day = isoDay(dateISO)
  if (!day || window.empty) return false
  return day >= window.startISO && day <= window.endISO
}

/** Sum a daily field over the window. Rows without a usable date are skipped. */
export function sumInWindow<T extends { date: string }>(
  rows: readonly T[],
  window: PacingWindow,
  pick: (row: T) => number,
): number {
  let total = 0
  for (const row of rows) {
    if (!inPacingWindow(row.date, window)) continue
    const n = Number(pick(row))
    if (Number.isFinite(n)) total += n
  }
  return total
}

/**
 * How a fee-inclusive line's spend goal is netted back to media.
 * Lines whose budget does not include fees keep their burst budget.
 */
export type NetSpendBasis = {
  budgetIncludesFees: boolean
  /** Channel fee percent from `mba_fee_snapshots` (0–100). Null when unknown. */
  feePct?: number | null
  /** The line's net media total (`attrs.totalMedia`) when stored. */
  lineTotalMedia?: number | null
}

function moneyOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === 1
}

/**
 * Net spend basis for one plan line on the campaign dashboard.
 * `mediaType` is the schedule media type for the fee snapshot
 * (`socialMedia`, `progDisplay`, `progVideo`, `progOoh`, `search`, ...).
 * The fee percent is null when the version has no fee snapshot row.
 */
export function netSpendBasisForLine(
  item: unknown,
  opts: {
    mediaType: string
    feePctsByVersionId?: FeePctsByVersionId
    fallbackVersionId?: number | null
  },
): NetSpendBasis {
  const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
  const budgetIncludesFees = flag(rec.budget_includes_fees ?? rec.budgetIncludesFees)
  if (!budgetIncludesFees) return { budgetIncludesFees: false }
  const versionId = versionIdFromLine(rec) ?? positiveVersionId(opts.fallbackVersionId)
  const hasRow = versionId != null && Boolean(opts.feePctsByVersionId?.[String(versionId)])
  return {
    budgetIncludesFees: true,
    feePct: hasRow ? feePctForScheduleMedia(opts.feePctsByVersionId, versionId, opts.mediaType) : null,
    lineTotalMedia: moneyOrNull(rec.totalMedia ?? rec.total_media),
  }
}

function burstsOf(raw: unknown): NormalisedBurst[] {
  return parseBurstsToNormalised(raw)
}

/**
 * Spend goal per burst, media only.
 * Not fee-inclusive: the burst budget.
 * Fee-inclusive: the burst's stored media amount; else the line's stored net
 * total spread over the bursts by budget; else `netBurstMediaForPacing`
 * (gross less the channel fee from the fee snapshot).
 */
export function burstSpendGoals(rawBursts: unknown, basis?: NetSpendBasis | null): number[] {
  const bursts = burstsOf(rawBursts)
  if (!basis?.budgetIncludesFees) return bursts.map((b) => b.budget)
  const grossSum = bursts.reduce((sum, b) => sum + (b.budget > 0 ? b.budget : 0), 0)
  const total = basis.lineTotalMedia
  const hasTotal = typeof total === "number" && Number.isFinite(total) && total > 0 && grossSum > 0
  return bursts.map((b) => {
    if (typeof b.mediaAmount === "number" && Number.isFinite(b.mediaAmount) && b.mediaAmount > 0) {
      return b.mediaAmount
    }
    if (hasTotal) return (b.budget > 0 ? b.budget : 0) * (total! / grossSum)
    return netBurstMediaForPacing(
      { budget: b.budget },
      { budgetIncludesFees: true },
      typeof basis.feePct === "number" && Number.isFinite(basis.feePct) ? basis.feePct : 0,
    )
  })
}

export type PacingKind = "spend" | "deliverables"

function burstAmounts(rawBursts: unknown, kind: PacingKind, basis?: NetSpendBasis | null) {
  const bursts = burstsOf(rawBursts)
  const amounts =
    kind === "spend" ? burstSpendGoals(bursts, basis) : bursts.map((b) => b.calculatedValue)
  return bursts.map((b, i) => ({ startISO: b.startDate, endISO: b.endDate, amount: amounts[i] ?? 0 }))
}

/** Whole-line planned total: spend (media only for fee-inclusive lines) or deliverables. */
export function plannedTotal(rawBursts: unknown, kind: PacingKind, basis?: NetSpendBasis | null): number {
  return burstAmounts(rawBursts, kind, basis).reduce((sum, b) => sum + (b.amount > 0 ? b.amount : 0), 0)
}

/**
 * Expected inside the window: each burst's amount spread evenly over its
 * inclusive days, counting the days that fall in the window.
 */
export function expectedForWindow(
  rawBursts: unknown,
  kind: PacingKind,
  window: PacingWindow,
  basis?: NetSpendBasis | null,
): number {
  if (window.empty) return 0
  const ws = dayIndex(window.startISO)
  const we = dayIndex(window.endISO)
  let total = 0
  for (const burst of burstAmounts(rawBursts, kind, basis)) {
    if (!(burst.amount > 0)) continue
    const bs = dayIndex(burst.startISO)
    const be = dayIndex(burst.endISO)
    if (!Number.isFinite(bs) || !Number.isFinite(be) || be < bs) continue
    const from = Math.max(bs, ws)
    const to = Math.min(be, we)
    if (to < from) continue
    total += burst.amount * ((to - from + 1) / (be - bs + 1))
  }
  return total
}

/**
 * Decision 1: a line with clicks but no impressions in the window is a click
 * tracker. Its impressions are not tracked, so it is left out of expected
 * impressions.
 */
export function impressionsNotTracked(delivered: { impressions: number; clicks: number }): boolean {
  return !(delivered.impressions > 0) && delivered.clicks > 0
}

export type PaceVsExpected = {
  /** Delivered ÷ expected × 100. Undefined when nothing is expected. */
  pct: number | undefined
  status: DeliveryStatus
  /** (pct − 100) / 100; 0 when nothing is expected. */
  variance: number
  /** Delivered ÷ expected, clamped 0..1. 1 when delivery runs with nothing expected. */
  progress: number
}

/** Delivered against expected for the window. Nothing expected is No data, not Behind. */
export function paceVsExpected(delivered: number, expected: number): PaceVsExpected {
  const d = Number.isFinite(delivered) ? delivered : 0
  if (!(Number.isFinite(expected) && expected > 0)) {
    return { pct: undefined, status: "no-data", variance: 0, progress: d > 0 ? 1 : 0 }
  }
  const pct = (d / expected) * 100
  return {
    pct,
    status: deliveryStatusFromPct(pct),
    variance: (pct - 100) / 100,
    progress: Math.max(0, Math.min(1, d / expected)),
  }
}

/** "to date" or "in period" for card copy. */
export function windowPhrase(window: PacingWindow): string {
  return window.filtered ? "in period" : "to date"
}
