import { parseDateOnlyString } from "@/lib/timezone"
import { roundMoney4 } from "@/lib/utils/money"

function parseAmount(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function safeParseDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value)
  }
  if (typeof value === "string") {
    try {
      return parseDateOnlyString(value)
    } catch {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  const parsed = new Date(value as string | number)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const startDay = startOfDay(start).getTime()
  const endDay = startOfDay(end).getTime()
  if (endDay < startDay) return 0
  return Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1
}

/** First day of calendar month for a billing row (aligned with mediaplans API). */
export function extractBillingMonthStart(entry: unknown): Date | null {
  if (!entry || typeof entry !== "object") return null
  const e = entry as Record<string, unknown>
  const raw =
    e.monthYear ??
    e.month_year ??
    e.month ??
    e.billingMonth ??
    e.date ??
    e.startDate ??
    e.periodStart ??
    e.period_start
  const parsed = safeParseDate(raw)
  if (!parsed) return null
  const monthStart = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  monthStart.setHours(0, 0, 0, 0)
  return monthStart
}

export function sumBillingEntryAmount(entry: unknown): number {
  if (!entry || typeof entry !== "object") return 0
  const e = entry as Record<string, unknown>
  if (e.totalAmount !== undefined && e.totalAmount !== null) return parseAmount(e.totalAmount)
  if (e.amount !== undefined && e.amount !== null) return parseAmount(e.amount)

  let total = 0
  const mediaTypes = Array.isArray(e.mediaTypes) ? e.mediaTypes : []
  for (const mt of mediaTypes) {
    if (!mt || typeof mt !== "object") continue
    const m = mt as Record<string, unknown>
    const lineItems = Array.isArray(m.lineItems) ? m.lineItems : []
    for (const item of lineItems) {
      if (item && typeof item === "object") {
        total += parseAmount((item as Record<string, unknown>).amount)
      }
    }
  }
  return total
}

/**
 * Expected spend to date from billing schedule rows (same model as
 * `GET /api/mediaplans/mba/[mba_number]` → `metrics.expectedSpendToDate`).
 */
export function calculateExpectedSpendToDateFromBillingSchedule(
  billingSchedule: unknown,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number {
  if (!billingSchedule || !Array.isArray(billingSchedule)) return 0
  if (!startDate || !endDate) return 0

  const start = safeParseDate(startDate)
  const end = safeParseDate(endDate)
  if (!start || !end) return 0
  const today = new Date()

  const campaignStart = startOfDay(start)
  const campaignEnd = endOfDay(end)
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)

  if (todayEnd < campaignStart) return 0

  const monthlyTotals = new Map<
    string,
    { amount: number; monthStart: Date; monthEnd: Date }
  >()

  for (const entry of billingSchedule) {
    const monthStart = extractBillingMonthStart(entry)
    if (!monthStart) continue
    const amount = sumBillingEntryAmount(entry)
    if (!amount) continue
    const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`
    const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
    const existing = monthlyTotals.get(key)
    if (existing) {
      existing.amount += amount
    } else {
      monthlyTotals.set(key, { amount, monthStart, monthEnd })
    }
  }

  let expected = 0

  monthlyTotals.forEach(({ amount, monthStart, monthEnd }) => {
    const windowStart = monthStart > campaignStart ? monthStart : campaignStart
    const windowEnd = monthEnd < campaignEnd ? monthEnd : campaignEnd
    if (windowEnd < windowStart) return

    if (todayEnd >= windowEnd) {
      expected += amount
      return
    }

    if (todayStart < windowStart) {
      return
    }

    const totalDays = daysBetweenInclusive(windowStart, windowEnd)
    const elapsedDays = Math.min(totalDays, daysBetweenInclusive(windowStart, todayStart))
    if (totalDays <= 0 || elapsedDays <= 0) return

    expected += amount * (elapsedDays / totalDays)
  })

  return roundMoney4(expected)
}

/** Sum billing amounts for months that overlap the campaign window. */
export function totalPlannedSpendFromBillingSchedule(
  billingSchedule: unknown,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number {
  if (!billingSchedule || !Array.isArray(billingSchedule)) return 0
  const start = safeParseDate(startDate ?? null)
  const end = safeParseDate(endDate ?? null)
  if (!start || !end) {
    let sum = 0
    for (const entry of billingSchedule) {
      sum += sumBillingEntryAmount(entry)
    }
    return roundMoney4(sum)
  }

  const campaignStart = startOfDay(start)
  const campaignEnd = endOfDay(end)
  let total = 0

  for (const entry of billingSchedule) {
    const monthStart = extractBillingMonthStart(entry)
    if (!monthStart) continue
    const amount = sumBillingEntryAmount(entry)
    if (!amount) continue
    const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
    const windowStart = monthStart > campaignStart ? monthStart : campaignStart
    const windowEnd = monthEnd < campaignEnd ? monthEnd : campaignEnd
    if (windowEnd < windowStart) continue
    total += amount
  }

  return roundMoney4(total)
}
