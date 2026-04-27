/**
 * Shared internal helpers for lib/api/dashboard/* modules.
 */
import axios from 'axios'
import { slugifyClientNameForUrl } from '@/lib/clients/slug'

export const MELBOURNE_TZ = 'Australia/Melbourne'
export const DAY_MS = 24 * 60 * 60 * 1000

// Create axios instance with timeout
export const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
})

export const isDashboardDebug = () => process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === 'true'

// Helper function to normalize client names for consistent comparison
export function normalizeClientName(name: string): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeStatus(status: any): string {
  if (status === null || status === undefined) return ''
  return String(status).trim().toLowerCase()
}

/** Collapse MBA variants (trim, string) so one logical plan does not create duplicate dashboard cards. */
export function normalizeMbaKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  return s.length > 0 ? s : null
}

export function numericVersion(v: any): number {
  const n = Number(v?.version_number)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Same rule as mediaplans editor: one row per MBA — the highest version_number (tie-break: updated_at). */
export function pickHighestVersionRow(versions: any[]): any | null {
  if (!Array.isArray(versions) || versions.length === 0) return null
  return versions.reduce((best, v) => {
    const vn = numericVersion(v)
    const bn = numericVersion(best)
    if (vn > bn) return v
    if (vn < bn) return best
    const vUp = parseDateSafe(v.updated_at)?.getTime() ?? 0
    const bUp = parseDateSafe(best.updated_at)?.getTime() ?? 0
    return vUp >= bUp ? v : best
  })
}

export function normalizeTags(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === 'string' ? tag : String(tag)))
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  }
  return []
}

export const isBookedApprovedCompleted = (status: any) => {
  const normalized = normalizeStatus(status)
  return normalized === 'booked' || normalized === 'approved' || normalized === 'completed'
}

export function hasBookedApprovedCompletedTag(value: any): boolean {
  const tags = normalizeTags(value)
  return tags.some((tag) => tag === 'booked' || tag === 'approved' || tag === 'completed')
}

export function slugifyClientName(name: string): string {
  return slugifyClientNameForUrl(normalizeClientName(name))
}

export function getAustralianFinancialYear(date = new Date()) {
  const currentYear = date.getFullYear()
  const isAfterJune = date.getMonth() >= 6 // July is 6
  const startYear = isAfterJune ? currentYear : currentYear - 1

  const start = new Date(startYear, 6, 1, 0, 0, 0, 0)
  const end = new Date(startYear + 1, 5, 30, 23, 59, 59, 999)
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

  return { start, end, months }
}

export function parseDateSafe(value: any): Date | null {
  if (!value) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date
}

export type TzParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

export function getTzParts(date: Date, timeZone = MELBOURNE_TZ): TzParts {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = formatter.formatToParts(date).reduce<Record<string, number>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = Number(part.value)
    }
    return acc
  }, {})

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

export function makeZonedDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
  timeZone = MELBOURNE_TZ,
): Date {
  const utcGuess = Date.UTC(year, monthIndex, day, hour, minute, second, ms)
  const parts = getTzParts(new Date(utcGuess), timeZone)
  const asLocal = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, ms)
  const offset = asLocal - utcGuess
  return new Date(utcGuess - offset)
}

export function getTodayWindow() {
  const parts = getTzParts(new Date())
  const start = makeZonedDate(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
  const end = makeZonedDate(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999)
  return { start, end }
}

export function getLast30DaysWindow() {
  const { start: todayStart, end: todayEnd } = getTodayWindow()
  const start = new Date(todayStart.getTime() - 29 * DAY_MS)
  return { start, end: todayEnd }
}

export function getAustralianFinancialYearWindow(reference: Date = new Date()) {
  const parts = getTzParts(reference)
  const isAfterJune = parts.month >= 7 // July is month 7 in 1-based parts
  const startYear = isAfterJune ? parts.year : parts.year - 1
  const start = makeZonedDate(startYear, 6, 1, 0, 0, 0, 0) // July 1
  const end = makeZonedDate(startYear + 1, 5, 30, 23, 59, 59, 999) // June 30
  return { start, end }
}

export function parseMonthYearLabel(label: any): { start: Date; end: Date } | null {
  if (!label || typeof label !== 'string') return null
  const trimmed = label.trim()
  if (!trimmed) return null

  // Support formats like "December 2025", "Dec 2025", "2025-12", "2025/12", "202512"
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]

  let year: number | null = null
  let monthIndex: number | null = null

  // 2025-12 or 2025/12
  if (/^\d{4}[-/]\d{2}$/.test(trimmed)) {
    const [y, m] = trimmed.split(/[-/]/)
    year = Number(y)
    monthIndex = Number(m) - 1
  }

  // 202512
  if (!year && /^\d{6}$/.test(trimmed)) {
    year = Number(trimmed.slice(0, 4))
    monthIndex = Number(trimmed.slice(4, 6)) - 1
  }

  // December 2025 or Dec 2025
  if (!year) {
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2) {
      const maybeMonth = parts[0].toLowerCase()
      const maybeYear = Number(parts[1])
      const nameIndex = monthNames.findIndex((m) => m.startsWith(maybeMonth))
      if (!Number.isNaN(maybeYear) && nameIndex >= 0) {
        year = maybeYear
        monthIndex = nameIndex
      }
    }
  }

  if (year === null || monthIndex === null || monthIndex < 0 || monthIndex > 11) return null

  const start = makeZonedDate(year, monthIndex, 1, 0, 0, 0, 0)
  const end = makeZonedDate(year, monthIndex + 1, 0, 23, 59, 59, 999) // day 0 of next month = last day current
  return { start, end }
}

export function sumLineItems(entry: any): number {
  const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
  const lineItemTotal = mediaTypes.reduce((mtSum: number, mt: any) => {
    const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
    const liSum = lineItems.reduce((liAcc: number, li: any) => liAcc + parseMoney(li?.amount), 0)
    return mtSum + liSum
  }, 0)

  const feeTotal = parseMoney(entry?.feeTotal)
  const production = parseMoney(entry?.production)
  const adServing = parseMoney(entry?.adservingTechFees ?? entry?.adServingTechFees)

  return lineItemTotal + feeTotal + production + adServing
}

export function deliveryLineItemIsClientPaidDirect(li: any): boolean {
  return li?.clientPaysForMedia === true || li?.client_pays_for_media === true
}

/** Delivery schedule month row: agency-owed media only (excludes client-paid-direct line items). Fees/production/ad serving unchanged. */
export function sumDeliveryScheduleMonthAgencyMedia(entry: any): number {
  const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
  const lineItemTotal = mediaTypes.reduce((mtSum: number, mt: any) => {
    const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
    const liSum = lineItems.reduce((liAcc: number, li: any) => {
      if (deliveryLineItemIsClientPaidDirect(li)) return liAcc
      return liAcc + parseMoney(li?.amount)
    }, 0)
    return mtSum + liSum
  }, 0)

  const feeTotal = parseMoney(entry?.feeTotal)
  const production = parseMoney(entry?.production)
  const adServing = parseMoney(entry?.adservingTechFees ?? entry?.adServingTechFees)

  return lineItemTotal + feeTotal + production + adServing
}

export function calcOverlapAmountForWindow(
  entryRange: { start: Date; end: Date },
  totalAmount: number,
  window: { start: Date; end: Date },
): number {
  const overlapStart = new Date(Math.max(entryRange.start.getTime(), window.start.getTime()))
  const overlapEnd = new Date(Math.min(entryRange.end.getTime(), window.end.getTime()))
  if (overlapEnd < overlapStart) return 0
  const overlapDays = Math.max(1, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / DAY_MS) + 1)
  const entryDays = Math.max(1, Math.round((entryRange.end.getTime() - entryRange.start.getTime()) / DAY_MS) + 1)
  return (totalAmount * overlapDays) / entryDays
}

export function computeSpendFromDelivery(
  deliverySchedule: any[],
  windows: { last30d: { start: Date; end: Date }; fy: { start: Date; end: Date } },
): { last30d: number; fy: number } {
  let last30d = 0
  let fy = 0

  deliverySchedule.forEach((entry) => {
    const monthRange = parseMonthYearLabel(entry?.monthYear ?? entry?.month_year ?? entry?.monthLabel ?? entry?.month_label)
    const explicitDate = parseDateSafe(entry?.date ?? entry?.day ?? entry?.startDate ?? entry?.start_date)

    const amount = sumLineItems(entry)
    if (!amount || amount <= 0) return

    // Monthly bucket: pro-rate by overlap days
    if (monthRange) {
      last30d += calcOverlapAmountForWindow(monthRange, amount, windows.last30d)
      fy += calcOverlapAmountForWindow(monthRange, amount, windows.fy)
      return
    }

    // Daily entry: include if inside window
    if (explicitDate) {
      const dayStart = makeZonedDate(
        explicitDate.getUTCFullYear(),
        explicitDate.getUTCMonth(),
        explicitDate.getUTCDate(),
        0,
        0,
        0,
        0,
      )
      const dayEnd = makeZonedDate(
        explicitDate.getUTCFullYear(),
        explicitDate.getUTCMonth(),
        explicitDate.getUTCDate(),
        23,
        59,
        59,
        999,
      )
      if (dayEnd >= windows.last30d.start && dayStart <= windows.last30d.end) {
        last30d += amount
      }
      if (dayEnd >= windows.fy.start && dayStart <= windows.fy.end) {
        fy += amount
      }
    }
  })

  return { last30d, fy }
}

export function parseMoney(value: any): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function parseMonthYear(monthYear: any): Date | null {
  if (!monthYear) return null
  if (monthYear instanceof Date) {
    return isNaN(monthYear.getTime())
      ? null
      : new Date(monthYear.getFullYear(), monthYear.getMonth(), 1)
  }
  if (typeof monthYear === 'number') {
    // Handle YYYYMM numeric format (e.g. 202407)
    const asString = String(monthYear)
    if (/^\d{6}$/.test(asString)) {
      const yearNum = parseInt(asString.slice(0, 4), 10)
      const monthNum = parseInt(asString.slice(4, 6), 10)
      if (!isNaN(yearNum) && monthNum >= 1 && monthNum <= 12) {
        return new Date(yearNum, monthNum - 1, 1)
      }
    }
    return null
  }
  if (typeof monthYear !== 'string') return null
  const trimmed = monthYear.trim()
  if (!trimmed) return null

  // YYYY-MM or YYYY/MM
  if (/^\d{4}[-/]\d{2}$/.test(trimmed)) {
    const [yearStr, monthStr] = trimmed.split(/[-/]/)
    const yearNum = parseInt(yearStr, 10)
    const monthNum = parseInt(monthStr, 10)
    if (!isNaN(yearNum) && monthNum >= 1 && monthNum <= 12) {
      return new Date(yearNum, monthNum - 1, 1)
    }
  }

  // MM/YYYY or M/YYYY
  if (/^\d{1,2}[-/]\d{4}$/.test(trimmed)) {
    const [monthStr, yearStr] = trimmed.split(/[-/]/)
    const yearNum = parseInt(yearStr, 10)
    const monthNum = parseInt(monthStr, 10)
    if (!isNaN(yearNum) && monthNum >= 1 && monthNum <= 12) {
      return new Date(yearNum, monthNum - 1, 1)
    }
  }

  // Month name + year (e.g. "Jul 2024", "July 2024")
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const [monthName, yearStr] = parts
    const monthIndex = [
      'january','february','march','april','may','june',
      'july','august','september','october','november','december'
    ].indexOf(monthName.toLowerCase())
    const yearNum = parseInt(yearStr, 10)
    if (monthIndex >= 0 && !isNaN(yearNum)) {
      return new Date(yearNum, monthIndex, 1)
    }
  }

  // Fallback to Date parsing (e.g. ISO strings)
  const parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  }

  return null
}

export function getMonthYearValue(entry: any) {
  return (
    entry?.monthYear ??
    entry?.month_year ??
    entry?.month ??
    entry?.monthLabel ??
    entry?.month_label ??
    null
  )
}

export function normalizeSchedule(schedule: any): any[] {
  if (!schedule) return []
  if (Array.isArray(schedule)) return schedule
  if (typeof schedule === "string") {
    try {
      const parsed = JSON.parse(schedule)
      if (Array.isArray(parsed)) return parsed
      if (parsed?.months && Array.isArray(parsed.months)) return parsed.months
      return []
    } catch {
      return []
    }
  }
  if (schedule?.months && Array.isArray(schedule.months)) {
    return schedule.months
  }
  return []
}
