import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { toMelbourneDateString } from "@/lib/timezone"
import { roundMoney2 } from "@/lib/utils/money"

function parseAmountSafe(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""))
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

type CivilDateParts = { year: number; month: number; day: number }

function parseISOCivilDate(iso: string | null | undefined): CivilDateParts | null {
  if (!iso || typeof iso !== "string") return null
  const trimmed = iso.trim()
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** Month names as they appear in API labels (short + full). */
const MONTH_TOKEN_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

function parseMonthLabel(input: unknown): { year: number; month: number } | null {
  if (input === null || input === undefined) return null
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    try {
      const iso = toMelbourneDateString(input)
      const p = parseISOCivilDate(iso)
      return p ? { year: p.year, month: p.month } : null
    } catch {
      return null
    }
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    const asString = String(input)
    if (asString.length === 6) {
      const year = Number(asString.slice(0, 4))
      const month = Number(asString.slice(4, 6))
      if (month >= 1 && month <= 12) return { year, month }
    }
  }
  if (typeof input === "string") {
    const trimmed = input.trim()
    if (!trimmed || /^unknown$/i.test(trimmed)) return null

    const isoLike = trimmed.match(/^(\d{4})[-/](\d{1,2})/)
    if (isoLike) {
      const year = Number(isoLike[1])
      const month = Number(isoLike[2])
      if (month >= 1 && month <= 12) return { year, month }
    }

    const named = trimmed.match(/^([a-z]+)\s+(\d{4})$/i)
    if (named) {
      const token = named[1].toLowerCase()
      const year = Number(named[2])
      const month = MONTH_TOKEN_TO_NUM[token]
      if (month && Number.isFinite(year)) return { year, month }
    }

    const parsedDate = new Date(trimmed)
    if (!Number.isNaN(parsedDate.getTime())) {
      try {
        const iso = toMelbourneDateString(parsedDate)
        const p = parseISOCivilDate(iso)
        return p ? { year: p.year, month: p.month } : null
      } catch {
        return { year: parsedDate.getFullYear(), month: parsedDate.getMonth() + 1 }
      }
    }
  }
  return null
}

function sumNumericValues(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = parseAmountSafe(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === "object") {
    return Object.values(value as object).reduce<number>((acc, child) => acc + sumNumericValues(child), 0)
  }
  return 0
}

const LABEL_KEYS = new Set(["monthYear", "month", "date", "label", "id", "month_label", "monthLabel"])

function lineItemAmount(row: unknown): number {
  if (!row || typeof row !== "object") return 0
  const r = row as Record<string, unknown>
  const candidates = [
    r.amount,
    r.totalAmount,
    r.cost,
    r.value,
    r.total,
    r.budget,
    r.media_investment,
    r.spend,
  ]
  for (const c of candidates) {
    const n = parseAmountSafe(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/** Prefer summing `data[]` amounts (billing / metrics API shape). */
function dataRowAmount(row: unknown): number {
  if (!row || typeof row !== "object") return 0
  const r = row as Record<string, unknown>
  const lineItems = r.lineItems
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    const liSum = lineItems.reduce((s, li) => s + lineItemAmount(li), 0)
    if (liSum > 0) return liSum
  }
  return lineItemAmount(r)
}

function monthRowTotal(entry: Record<string, unknown>): number {
  const data = entry.data
  if (Array.isArray(data) && data.length > 0) {
    const fromData = data.reduce((sum, row) => sum + dataRowAmount(row), 0)
    if (fromData > 0) return fromData
  }

  return Object.entries(entry).reduce((acc, [key, value]) => {
    if (LABEL_KEYS.has(key) || key === "data") return acc
    const numericValue = sumNumericValues(value)
    return Number.isFinite(numericValue) ? acc + numericValue : acc
  }, 0)
}

function daysInCalendarMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

function monthKeyParts(y: number, m: number): number {
  return y * 100 + m
}

function parseMelbourneTodayParts(): CivilDateParts | null {
  const iso = getMelbourneTodayISO()
  return parseISOCivilDate(iso)
}

function dateKey(p: CivilDateParts): number {
  return p.year * 10000 + p.month * 100 + p.day
}

function monthTouchesCampaignRange(
  y: number,
  month1to12: number,
  campStart: CivilDateParts | null,
  campEnd: CivilDateParts | null,
): boolean {
  const mk = monthKeyParts(y, month1to12)
  if (campStart && mk < monthKeyParts(campStart.year, campStart.month)) return false
  if (campEnd && mk > monthKeyParts(campEnd.year, campEnd.month)) return false
  return true
}

function campaignDayRangeInMonth(
  y: number,
  month1to12: number,
  dim: number,
  campStart: CivilDateParts | null,
  campEnd: CivilDateParts | null,
): { lo: number; hi: number } | null {
  if (!monthTouchesCampaignRange(y, month1to12, campStart, campEnd)) return null

  let lo = 1
  let hi = dim

  if (campStart && campStart.year === y && campStart.month === month1to12) {
    lo = Math.max(lo, campStart.day)
  }
  if (campEnd && campEnd.year === y && campEnd.month === month1to12) {
    hi = Math.min(hi, campEnd.day)
  }

  if (hi < lo) return null
  return { lo, hi }
}

function linearShare(rowTotal: number, dim: number, lo: number, hi: number): number {
  if (!Number.isFinite(rowTotal) || rowTotal <= 0 || dim <= 0) return 0
  if (hi < lo) return 0
  return rowTotal * ((hi - lo + 1) / dim)
}

function parseDeliveryArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw)
      if (Array.isArray(p)) return p
      if (p && typeof p === "object" && Array.isArray((p as { months?: unknown }).months)) {
        return (p as { months: any[] }).months
      }
      return []
    } catch {
      return []
    }
  }
  if (raw && typeof raw === "object" && raw !== null && Array.isArray((raw as { months?: unknown }).months)) {
    return (raw as { months: any[] }).months
  }
  return []
}

/** Match `getMonthLabel` in mediaplans/campaigns API so keys align with `deliveryMonthlySpend`. */
function deliveryEntryMonthLabel(entry: any): string {
  const cand =
    entry?.month ??
    entry?.monthYear ??
    entry?.month_year ??
    entry?.billingMonth ??
    entry?.billing_month ??
    entry?.period_start ??
    entry?.periodStart ??
    entry?.date ??
    entry?.startDate
  if (cand === null || cand === undefined || cand === "") return ""
  const date = new Date(cand)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  return String(cand).trim()
}

/**
 * Build `{ month, data: [{ mediaType, amount }] }[]` from raw delivery schedule when metrics
 * arrays are empty but entries carry amounts under `mediaTypes[].lineItems`.
 */
export function monthlySpendArrayFromDeliverySchedule(deliverySchedule: unknown): Array<{
  month: string
  data: Array<{ mediaType: string; amount: number }>
}> {
  const parsed = parseDeliveryArray(deliverySchedule)
  const monthlyMap: Record<string, Record<string, number>> = {}

  const add = (label: string, channel: string, amount: number) => {
    if (!label || !Number.isFinite(amount) || amount <= 0) return
    monthlyMap[label] = monthlyMap[label] || {}
    const k = String(channel)
    monthlyMap[label][k] = (monthlyMap[label][k] || 0) + amount
  }

  for (const entry of parsed) {
    const monthLabel = deliveryEntryMonthLabel(entry)
    if (!monthLabel) continue

    const fees =
      parseAmountSafe(entry?.feeTotal) +
      parseAmountSafe(entry?.production) +
      parseAmountSafe(entry?.adservingTechFees ?? entry?.adServingTechFees)

    const topScalar = parseAmountSafe(
      entry?.spend ??
        entry?.amount ??
        entry?.budget ??
        entry?.value ??
        entry?.investment ??
        entry?.media_investment,
    )

    const topLineItems = Array.isArray(entry?.lineItems) ? entry.lineItems : []
    const topLineSum = topLineItems.reduce((s: number, li: unknown) => s + lineItemAmount(li), 0)

    const defaultChannel =
      entry?.channel ||
      entry?.media_channel ||
      entry?.mediaType ||
      entry?.media_type ||
      entry?.publisher ||
      "Other"

    const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
    let fromMediaTypes = false

    if (mediaTypes.length > 0) {
      for (const mt of mediaTypes) {
        const channel =
          mt?.mediaType ||
          mt?.media_type ||
          mt?.type ||
          mt?.name ||
          mt?.channel ||
          defaultChannel
        const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
        const lineTotal = lineItems.reduce((s: number, li: unknown) => s + lineItemAmount(li), 0)
        const mtScalar = parseAmountSafe(
          mt?.amount ?? mt?.totalAmount ?? mt?.budget ?? mt?.value ?? mt?.cost ?? mt?.media_investment,
        )
        const amount = lineTotal > 0 ? lineTotal : mtScalar
        if (amount > 0) {
          add(monthLabel, channel, amount)
          fromMediaTypes = true
        }
      }
    }

    if (topLineSum > 0) {
      add(monthLabel, defaultChannel, topLineSum)
      fromMediaTypes = true
    }

    if (fees > 0) {
      add(monthLabel, "Fees", fees)
      fromMediaTypes = true
    }

    if (!fromMediaTypes && topScalar > 0) {
      add(monthLabel, defaultChannel, topScalar)
    }
  }

  return Object.entries(monthlyMap).map(([month, data]) => ({
    month,
    data: Object.entries(data).map(([mediaType, amount]) => ({ mediaType, amount })),
  }))
}

/**
 * Prefer delivery monthly (when non-empty), else billing monthly, else derive from delivery schedule.
 * Passes through object-shaped `billingMonthlySpend` (record keyed by month label).
 */
export function resolveMonthlySpendForPlan(
  deliveryMonthlySpend: unknown,
  billingMonthlySpend: unknown,
  deliverySchedule: unknown,
): unknown {
  if (Array.isArray(deliveryMonthlySpend) && deliveryMonthlySpend.length > 0) {
    return deliveryMonthlySpend
  }
  if (Array.isArray(billingMonthlySpend) && billingMonthlySpend.length > 0) {
    return billingMonthlySpend
  }
  if (billingMonthlySpend && typeof billingMonthlySpend === "object" && !Array.isArray(billingMonthlySpend)) {
    const keys = Object.keys(billingMonthlySpend as object)
    if (keys.length > 0) return billingMonthlySpend
  }
  const derived = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
  return derived.length > 0 ? derived : []
}

export type MonthlyPlanCampaignOpts = {
  campaignStartISO?: string | null
  campaignEndISO?: string | null
}

export function expectedSpendToDateFromMonthlyCalendar(
  monthlySpend: unknown,
  opts?: MonthlyPlanCampaignOpts,
): number {
  const campStart = parseISOCivilDate(opts?.campaignStartISO ?? null)
  const campEnd = parseISOCivilDate(opts?.campaignEndISO ?? null)

  const todayParts = parseMelbourneTodayParts()
  if (!todayParts) return 0

  let asAt = todayParts
  if (campEnd && dateKey(todayParts) > dateKey(campEnd)) {
    asAt = campEnd
  }
  if (campStart && dateKey(asAt) < dateKey(campStart)) {
    return 0
  }

  const contribution = (parsed: { year: number; month: number }, rowTotal: number): number => {
    if (!Number.isFinite(rowTotal) || rowTotal <= 0) return 0

    const y = parsed.year
    const m = parsed.month
    const mk = monthKeyParts(y, m)
    const asMk = monthKeyParts(asAt.year, asAt.month)
    if (mk > asMk) return 0

    const dim = daysInCalendarMonth(y, m)
    if (dim <= 0) return 0

    const campRange = campaignDayRangeInMonth(y, m, dim, campStart, campEnd)
    if (!campRange) return 0

    let hi = campRange.hi
    if (mk === asMk) {
      hi = Math.min(hi, asAt.day)
    }

    if (hi < campRange.lo) return 0
    return linearShare(rowTotal, dim, campRange.lo, hi)
  }

  if (Array.isArray(monthlySpend)) {
    const total = monthlySpend.reduce((sum, entry) => {
      if (!entry || typeof entry !== "object") return sum
      const e = entry as Record<string, unknown>
      const monthLabel = e.monthYear ?? e.month ?? e.date ?? e.label
      const parsed = parseMonthLabel(monthLabel)
      if (!parsed) return sum
      return sum + contribution(parsed, monthRowTotal(e))
    }, 0)
    return roundMoney2(total)
  }

  if (monthlySpend && typeof monthlySpend === "object") {
    const total = Object.entries(monthlySpend as object).reduce((sum, [label, value]) => {
      const parsed = parseMonthLabel(label)
      if (!parsed) return sum
      const numericValue = sumNumericValues(value)
      if (!Number.isFinite(numericValue)) return sum
      return sum + contribution(parsed, numericValue)
    }, 0)
    return roundMoney2(total)
  }

  return 0
}

export function totalPlannedSpendFromMonthly(monthlySpend: unknown, opts?: MonthlyPlanCampaignOpts): number {
  const campStart = parseISOCivilDate(opts?.campaignStartISO ?? null)
  const campEnd = parseISOCivilDate(opts?.campaignEndISO ?? null)

  const plannedForRow = (parsed: { year: number; month: number }, rowTotal: number): number => {
    if (!Number.isFinite(rowTotal) || rowTotal <= 0) return 0
    const dim = daysInCalendarMonth(parsed.year, parsed.month)
    if (dim <= 0) return 0
    const campRange = campaignDayRangeInMonth(parsed.year, parsed.month, dim, campStart, campEnd)
    if (!campRange) return 0
    return linearShare(rowTotal, dim, campRange.lo, campRange.hi)
  }

  if (Array.isArray(monthlySpend)) {
    const total = monthlySpend.reduce((sum, entry) => {
      if (!entry || typeof entry !== "object") return sum
      const e = entry as Record<string, unknown>
      const monthLabel = e.monthYear ?? e.month ?? e.date ?? e.label
      const parsed = parseMonthLabel(monthLabel)
      if (!parsed) return sum
      return sum + plannedForRow(parsed, monthRowTotal(e))
    }, 0)
    return roundMoney2(total)
  }

  if (monthlySpend && typeof monthlySpend === "object") {
    const total = Object.entries(monthlySpend as object).reduce((sum, [label, value]) => {
      const parsed = parseMonthLabel(label)
      if (!parsed) return sum
      const numericValue = sumNumericValues(value)
      if (!Number.isFinite(numericValue)) return sum
      return sum + plannedForRow(parsed, numericValue)
    }, 0)
    return roundMoney2(total)
  }

  return 0
}

/** Expected spend to “today” (Melbourne), from raw `deliverySchedule` / `{ months: [] }` on the media plan version. */
export function expectedSpendToDateFromDeliveryScheduleMonthly(
  deliverySchedule: unknown,
  opts?: MonthlyPlanCampaignOpts,
): number {
  const rows = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
  if (rows.length === 0) return 0
  return expectedSpendToDateFromMonthlyCalendar(rows, opts)
}

/** Planned spend in the campaign date window from the version delivery schedule (monthly buckets). */
export function totalPlannedSpendFromDeliveryScheduleMonthly(
  deliverySchedule: unknown,
  opts?: MonthlyPlanCampaignOpts,
): number {
  const rows = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
  if (rows.length === 0) return 0
  return totalPlannedSpendFromMonthly(rows, opts)
}
