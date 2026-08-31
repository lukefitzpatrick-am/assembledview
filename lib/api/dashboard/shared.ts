/**
 * Shared internal helpers for lib/api/dashboard/* modules.
 */
import axios from 'axios'
import { slugifyClientNameForUrl } from '@/lib/clients/slug'
import { parseDateNativeSafe } from '@/lib/dates/parseDateNativeSafe'
import { xanoAuthHeaderRecord } from '@/lib/api/xano'
import {
  parseVersionNumber,
  pickPublishedVersionRow,
} from '@/lib/mediaplan/publishedVersionGuard'
import { MEDIA_TYPE_LABELS } from '@/lib/media/mediaTypes'

export const MELBOURNE_TZ = 'Australia/Melbourne'
export const DAY_MS = 24 * 60 * 60 * 1000

// Create axios instance with timeout; auth only when XANO_API_KEY is set
export const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    ...xanoAuthHeaderRecord(),
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
  return parseVersionNumber(v?.version_number ?? v?.versionNumber)
}

function versionPublishedAt(v: any): string | null {
  const raw = v?.published_at ?? v?.publishedAt
  if (raw == null) return null
  const s = String(raw).trim()
  return s.length > 0 ? s : null
}

function pickMaxVersionRow(versions: any[]): any | null {
  if (!Array.isArray(versions) || versions.length === 0) return null
  return versions.reduce((best, v) => {
    const vn = numericVersion(v)
    const bn = numericVersion(best)
    if (vn > bn) return v
    if (vn < bn) return best
    const vUp = parseDateNativeSafe(v.updated_at)?.getTime() ?? 0
    const bUp = parseDateNativeSafe(best.updated_at)?.getTime() ?? 0
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

/**
 * Commercial inclusion only — booked | approved | completed. Not tip picking.
 *
 * Three questions (never the same call):
 *   - which version is live      → publication (`published_at` / resolveDashboardLiveVersionRow)
 *   - does this campaign count   → commercial status (this predicate)
 *   - where is it in time        → resolveCampaignPhase
 */
export const isBookedApprovedCompleted = (status: any) => {
  const normalized = normalizeStatus(status)
  return normalized === 'booked' || normalized === 'approved' || normalized === 'completed'
}

/**
 * VC1-5 — which version is live for dashboard numbers.
 *
 * Order: caller `publishedVersionNumber` (master tip) → else highest version with
 * `published_at` non-null. Never reads `campaign_status`.
 *
 * Three questions (never the same call):
 *   - which version is live      → publication (this function / published_at)
 *   - does this campaign count   → commercial status (`isBookedApprovedCompleted`)
 *   - where is it in time        → resolveCampaignPhase
 */
export function resolveDashboardLiveVersionRow(
  versions: any[],
  publishedVersionNumber?: number | null,
): any | null {
  if (!Array.isArray(versions) || versions.length === 0) return null
  if (publishedVersionNumber != null && publishedVersionNumber > 0) {
    return pickPublishedVersionRow(versions, publishedVersionNumber)
  }
  const publishedRows = versions.filter((v) => versionPublishedAt(v) != null)
  return pickMaxVersionRow(publishedRows)
}

/**
 * Same tip rule as {@link resolveDashboardLiveVersionRow}. Kept for existing
 * call sites; prefer the VC1-5 name at new call sites.
 */
export function pickHighestVersionRow(
  versions: any[],
  publishedVersionNumber?: number,
): any | null {
  return resolveDashboardLiveVersionRow(versions, publishedVersionNumber)
}

/**
 * Live tip then commercial gate — for dashboard spend aggregators that used to
 * answer both questions with `isBookedApprovedCompleted` alone.
 */
export function resolveDashboardCommercialLiveVersionRow(
  versions: any[],
  publishedVersionNumber?: number | null,
): any | null {
  const live = resolveDashboardLiveVersionRow(versions, publishedVersionNumber)
  if (!live) return null
  if (!isBookedApprovedCompleted(live.campaign_status ?? live.campaignStatus)) {
    return null
  }
  return live
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

/**
 * `deliverySchedule` entries on `media_plan_versions` come in TWO shapes:
 * - 'types' (older/booked): `mediaTypes[].lineItems[].amount`; `mediaCosts`/`totalAmount` are 0.
 * - 'costs' (newer/approved): `mediaCosts{channelKey:"$x"}` + `totalAmount` + `mediaTotal` + `feeTotal`;
 *   no `mediaTypes` array.
 *
 * This normaliser returns a per-media-type-label breakdown for BOTH shapes so downstream readers
 * (spend totals, charts, expected-spend-to-date) never silently drop 'costs'-shape media.
 *
 * `mediaCosts.production` is a documented DUPLICATE of the top-level `production` fee field
 * (see `lib/billing/types.ts` BillingMonth doc) — it is intentionally excluded here so callers
 * that add `entry.production` separately (fees stay via feeTotal/production/adservingTechFees)
 * don't double-count it.
 */
export function normalizeDeliveryEntryMediaBreakdown(entry: any): Record<string, number> {
  const byMediaType: Record<string, number> = {}
  const add = (label: any, amount: number) => {
    const key = typeof label === 'string' && label.trim() ? label : 'Unspecified'
    if (!Number.isFinite(amount) || amount <= 0) return
    byMediaType[key] = (byMediaType[key] || 0) + amount
  }

  const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
  if (mediaTypes.length > 0) {
    mediaTypes.forEach((mt: any) => {
      const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
      const totalForType = lineItems.reduce((sum: number, li: any) => sum + parseMoney(li?.amount), 0)
      if (totalForType <= 0) return
      const label = mt?.mediaType || mt?.media_type || mt?.type || mt?.name || mt?.channel || 'Unspecified'
      add(label, totalForType)
    })
    return byMediaType
  }

  const mediaCosts = entry?.mediaCosts
  if (mediaCosts && typeof mediaCosts === 'object' && !Array.isArray(mediaCosts)) {
    Object.entries(mediaCosts as Record<string, unknown>).forEach(([channelKey, value]) => {
      if (channelKey === 'production') return // duplicate of top-level `production` fee — do not double-count
      const amount = parseMoney(value)
      if (amount <= 0) return
      add(MEDIA_TYPE_LABELS[channelKey] || channelKey, amount)
    })

    if (isDashboardDebug()) {
      const computedTotal = Object.values(byMediaType).reduce((sum, n) => sum + n, 0)
      const reportedTotal = parseMoney(entry?.mediaTotal)
      if (reportedTotal > 0 && Math.abs(reportedTotal - computedTotal) > 0.5) {
        console.warn('[dashboard] normalizeDeliveryEntryMediaBreakdown: computed media total diverges from entry.mediaTotal', {
          computedTotal,
          reportedTotal,
        })
      }
    }
  }

  return byMediaType
}

/** Total media spend for one delivery-schedule entry, across BOTH 'types' and 'costs' shapes. */
export function sumDeliveryEntryMediaTotal(entry: any): number {
  const breakdown = normalizeDeliveryEntryMediaBreakdown(entry)
  return Object.values(breakdown).reduce((sum, n) => sum + n, 0)
}

export function sumLineItems(entry: any): number {
  const mediaTotal = sumDeliveryEntryMediaTotal(entry)

  const feeTotal = parseMoney(entry?.feeTotal)
  const production = parseMoney(entry?.production)
  const adServing = parseMoney(entry?.adservingTechFees ?? entry?.adServingTechFees)

  return mediaTotal + feeTotal + production + adServing
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
    const explicitDate = parseDateNativeSafe(entry?.date ?? entry?.day ?? entry?.startDate ?? entry?.start_date)

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
