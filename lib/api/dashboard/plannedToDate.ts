/**
 * Cross-client planned-spend-to-date per MBA, on the client-hub delivery-schedule
 * basis (`expectedSpendToDateFromDeliveryScheduleMonthly` + FY clamp).
 *
 * Not a second money path beside `global-monthly-*`: those aggregates are
 * month×client / month×publisher full-month totals for the current FY only.
 * This module is per-MBA, prorated to today, and parameterized by `fy`.
 */

import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  expectedSpendToDateFromMonthlyCalendar,
  monthlySpendArrayFromDeliverySchedule,
} from "@/lib/spend/monthlyPlanCalendar"
import {
  clampMonthlyAmountsToRange,
  type PlannedMonthAmount,
} from "@/lib/dashboard/clientDateRange"
import {
  auFyBoundsDateOnly,
  campaignOverlapsAuFinancialYear,
} from "@/lib/dates/auFinancialYear"
import { normalizeDateToMelbourneISO } from "@/lib/dates/normalizeCampaignDateISO"
import {
  isBookedApprovedCompleted,
  normalizeMbaKey,
  parseMonthYear,
  resolveDashboardLiveVersionRow,
} from "./shared"

export type PlannedToDateFy = number | "all"

export type BuildPlannedToDateOptions = {
  fy: PlannedToDateFy
  /** Master published watermark per MBA (`publishedVersionFromMaster`). */
  publishedByMba?: Map<string, number>
  /** Master commercial status (CS-B). Version status is the fallback. */
  mastersByMba?: Map<string, { campaign_status?: unknown }>
  /** When set, drop MBA keys not in the set (client-role tenant scope). */
  allowedMbaKeys?: Set<string>
}

export function parsePlannedToDateFyParam(
  raw: string | null | undefined,
): PlannedToDateFy | null {
  if (raw == null) return null
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed === "all") return "all"
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 2015 || n > 2100) return null
  return n
}

function yearMonthFromLabel(label: unknown): string | null {
  const date = parseMonthYear(label)
  if (!date) return null
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return `${year}-${String(month).padStart(2, "0")}`
}

function scheduleFromVersion(version: Record<string, unknown>): unknown {
  return version.deliverySchedule ?? version.delivery_schedule ?? null
}

function plannedMonthsFromSchedule(
  schedule: unknown,
  opts: { campaignStartISO?: string | null; campaignEndISO?: string | null },
): PlannedMonthAmount[] {
  const rows = monthlySpendArrayFromDeliverySchedule(schedule)
  const out: PlannedMonthAmount[] = []
  for (const row of rows) {
    const yearMonth = yearMonthFromLabel(row.month)
    if (!yearMonth) continue
    const amount = expectedSpendToDateFromMonthlyCalendar([row], opts)
    out.push({ yearMonth, amount })
  }
  return out
}

function monthsOverlapFy(
  months: PlannedMonthAmount[],
  rangeStartISO: string,
  rangeEndISO: string,
): boolean {
  const from = rangeStartISO.slice(0, 7)
  const to = rangeEndISO.slice(0, 7)
  return months.some((row) => {
    const key = row.yearMonth.slice(0, 7)
    return key >= from && key <= to
  })
}

function campaignTouchesFy(
  fy: PlannedToDateFy,
  startDate: unknown,
  endDate: unknown,
  months: PlannedMonthAmount[],
): boolean {
  if (fy === "all") return true
  if (campaignOverlapsAuFinancialYear(startDate, endDate, fy)) return true
  const { start, end } = auFyBoundsDateOnly(fy)
  return monthsOverlapFy(months, start, end)
}

/**
 * Per-MBA expected spend to date. Caller supplies version rows (with delivery
 * schedules). Does not filter by client, search, or live-today.
 */
export function buildPlannedToDateByMba(
  versions: unknown[],
  options: BuildPlannedToDateOptions,
): Record<string, number> {
  const { fy, publishedByMba, mastersByMba, allowedMbaKeys } = options
  const byMba: Record<string, unknown[]> = {}

  for (const raw of versions) {
    if (!raw || typeof raw !== "object") continue
    const version = raw as Record<string, unknown>
    const key = normalizeMbaKey(version.mba_number ?? version.mp_mba_number)
    if (!key) continue
    if (allowedMbaKeys && !allowedMbaKeys.has(key)) continue
    ;(byMba[key] ??= []).push(version)
  }

  const out: Record<string, number> = {}

  for (const [mbaKey, group] of Object.entries(byMba)) {
    const published = publishedByMba?.get(mbaKey)
    const live = resolveDashboardLiveVersionRow(group, published)
    if (!live || typeof live !== "object") continue

    const master = mastersByMba?.get(mbaKey)
    const status = master?.campaign_status ?? live.campaign_status ?? live.campaignStatus
    if (!isBookedApprovedCompleted(status)) continue

    const startDate = live.campaign_start_date ?? live.mp_campaigndates_start
    const endDate = live.campaign_end_date ?? live.mp_campaigndates_end
    const campaignStartISO = normalizeDateToMelbourneISO(startDate)
    const campaignEndISO = normalizeDateToMelbourneISO(endDate)
    const monthlyOpts = { campaignStartISO, campaignEndISO }

    const schedule = scheduleFromVersion(live as Record<string, unknown>)
    const months = plannedMonthsFromSchedule(schedule, monthlyOpts)

    if (!campaignTouchesFy(fy, startDate, endDate, months)) continue

    let amount: number
    if (fy === "all") {
      amount = expectedSpendToDateFromDeliveryScheduleMonthly(schedule, monthlyOpts)
    } else {
      const { start, end } = auFyBoundsDateOnly(fy)
      amount = clampMonthlyAmountsToRange(months, start, end)
    }

    out[mbaKey] = Number.isFinite(amount) ? amount : 0
  }

  return out
}
