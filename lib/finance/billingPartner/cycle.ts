/**
 * Advertising Associates billing cycle. Before the 17th Sydney, the cycle is
 * the current month. From the 17th, it is the next month. The page shows that
 * month's 17th, 24th, 26th and 28th.
 */
import { BillingPartnerPackError } from "@/lib/finance/billingPartner/errors"

const SYDNEY = "Australia/Sydney"
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/
const AA_DAYS = [17, 24, 26, 28] as const

export type AaCycleDate = { day: number; ymd: string }

export type BillingPartnerDueRow = {
  mbaNumber: string
  clientName: string
  campaignName: string
  versionId: number
  versionNumber: number
  publishedAt: string
  publishedBy: string | null
  changeKind: "new" | "amended"
  monthsChanged: string[] | null
  comparedTo: {
    versionNumber: number
    basis: "sent_pack" | "previous_published"
  } | null
  backDated: boolean
}

export type BillingPartnerPackRow = {
  id: string
  createdAt: string
  createdBy: string
  status: "draft" | "sent"
  itemCount: number
  sentAt: string | null
  sentBy: string | null
}

export type BillingPartnerPagePayload = {
  billingMonth: string
  monthLabel: string
  cycleDates: AaCycleDate[]
  due: BillingPartnerDueRow[]
  packs: BillingPartnerPackRow[]
}

export function normalizeBillingMonth(raw: string): string {
  const t = raw.trim()
  if (MONTH_KEY.test(t)) return `${t}-01`
  if (/^\d{4}-(0[1-9]|1[0-2])-01$/.test(t)) return t
  throw new BillingPartnerPackError(
    "billingMonth must be YYYY-MM or the first of that month",
    400,
  )
}

export function sydneyCalendar(now: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SYDNEY,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  }
}

export function sydneyYmd(now: Date): string {
  const { year, month, day } = sydneyCalendar(now)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** First of the billing month for the cycle that is open on `now`. */
export function defaultBillingMonth(now: Date = new Date()): string {
  const { year, month, day } = sydneyCalendar(now)
  if (day < 17) return `${year}-${pad2(month)}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${pad2(nextMonth)}-01`
}

export function aaCycleDates(billingMonth: string): AaCycleDate[] {
  const first = normalizeBillingMonth(billingMonth)
  const year = first.slice(0, 4)
  const month = first.slice(5, 7)
  return AA_DAYS.map((day) => ({ day, ymd: `${year}-${month}-${pad2(day)}` }))
}

export function billingMonthLabel(billingMonth: string): string {
  const first = normalizeBillingMonth(billingMonth)
  const [year, month] = first.split("-").map(Number)
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, 1)))
}

export function formatCycleDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number)
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)))
}

export function monthsChangedLabel(
  months: string[] | null,
  comparedTo: BillingPartnerDueRow["comparedTo"],
): string {
  const base = months == null ? "Not available" : months.length === 0 ? "None" : months.join(", ")
  if (!comparedTo) return base
  const basis = comparedTo.basis === "sent_pack" ? "sent" : "pre-pack"
  return `${base} vs v${comparedTo.versionNumber} (${basis})`
}

export function packSummaryFileName(billingMonth: string): string {
  return `AA pack summary ${billingMonthLabel(billingMonth)}.xlsx`
}

export function packZipFileName(billingMonth: string, now: Date = new Date()): string {
  return `AA pack ${billingMonthLabel(billingMonth)} ${sydneyYmd(now)}.zip`
}

export function financeActorEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}
