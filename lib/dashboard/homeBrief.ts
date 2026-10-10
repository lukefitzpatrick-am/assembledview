import { campaignDateOnly, auFyShortLabel, type AuFyFilterValue } from "@/lib/dates/auFinancialYear"
import { formatMoneyCompact } from "@/lib/format/money"

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

/** Australian financial year order, matching `getAustralianFinancialYear`. */
export const HOME_FY_MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"] as const

/**
 * Greeting lede from the pacing portfolio attention count.
 * Zero is the all-clear sentence. One uses the singular.
 */
export function homeAttentionLede(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "Everything is pacing to plan."
  const n = Math.trunc(count)
  if (n === 1) return "1 campaign needs a look today. Everything else is pacing to plan."
  return `${n} campaigns need a look today. Everything else is pacing to plan.`
}

export function homeMediaSpendLabel(fy: AuFyFilterValue): string {
  if (fy === "all") return "Media spend to date"
  return `Media spend ${auFyShortLabel(fy)} to date`
}

export function homeStartsWithinLabel(count: number): string {
  return `${count} start in the next 14 days`
}

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Campaigns whose start date falls on today through `days` later, Melbourne date-only. */
export function countCampaignStartsWithinDays(
  plans: Array<{ mp_campaigndates_start?: string | null }>,
  days: number,
  todayIso: string,
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso) || days < 0) return 0
  const end = addIsoDays(todayIso, days)
  let count = 0
  for (const plan of plans) {
    const start = campaignDateOnly(plan.mp_campaigndates_start)
    if (!start) continue
    if (start >= todayIso && start <= end) count += 1
  }
  return count
}

/** "12 Oct". Blank when the value is not a date. */
export function formatHomeStartDay(value: string | null | undefined): string {
  const iso = campaignDateOnly(value)
  if (!iso) return ""
  const day = Number(iso.slice(8, 10))
  const month = MONTH_SHORT[Number(iso.slice(5, 7)) - 1] ?? ""
  return `${day} ${month}`
}

export type HomeMonthBar = {
  month: string
  planned: number
  inProgress: boolean
}

/** Sum client rows from `GET /api/dashboard/global-monthly-client-spend` into FY month bars. */
export function plannedBarsFromClientMonths(
  rows: Array<{ month?: string | null; data?: Array<{ amount?: number | null }> | null }>,
  todayIso: string,
): HomeMonthBar[] {
  const monthIndex = Number(todayIso.slice(5, 7)) - 1
  const current = MONTH_SHORT[monthIndex] ?? ""
  const totals = new Map<string, number>()
  for (const row of rows) {
    const month = row.month?.trim() ?? ""
    if (!month) continue
    const amount = (row.data ?? []).reduce((sum, item) => {
      const value = item.amount
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0)
    }, 0)
    totals.set(month, (totals.get(month) ?? 0) + amount)
  }
  return HOME_FY_MONTHS.map((month) => ({
    month,
    planned: totals.get(month) ?? 0,
    inProgress: month === current,
  }))
}

/**
 * Last complete month's planned total. Delivered-by-month is not on Home,
 * so the sentence does not invent a delivered figure.
 */
export function homeSpendInsight(bars: HomeMonthBar[], todayIso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso) || bars.length === 0) return null
  const monthIndex = Number(todayIso.slice(5, 7)) - 1
  const previousIndex = monthIndex === 0 ? 11 : monthIndex - 1
  const previousShort = MONTH_SHORT[previousIndex]
  const previousLong = MONTH_LONG[previousIndex]
  const bar = bars.find((item) => item.month === previousShort)
  if (!bar) return null
  const planned = formatMoneyCompact(bar.planned, { millionScale: "home-spend" })
  return `${previousLong} planned ${planned}. Delivered by month is not loaded on Home.`
}
