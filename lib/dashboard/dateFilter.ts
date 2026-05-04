/**
 * Date range filtering helpers for the per-MBA dashboard.
 *
 * Server fetches full campaign data; the client applies URL-driven filters
 * before passing props to chart / table / Gantt children.
 */

export type DateRange = {
  start: Date | null
  end: Date | null
}

export type CampaignDateBounds = {
  start: Date | null
  end: Date | null
}

/** Parse YYYY-MM-DD as local date (avoids timezone drift on midnight UTC dates). */
export function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const year = Number(m[1])
    const monthIndex = Number(m[2]) - 1
    const day = Number(m[3])
    const d = new Date(year, monthIndex, day)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Filter an array of daily delivery entries to those within the date range.
 * Permissive: entries whose date doesn't parse are kept (don't drop unknown).
 *
 * @param entries  Array of daily entries with a `date` field (string, expected YYYY-MM-DD)
 * @param range    The date filter range; null start/end means no filter
 */
export function filterDailySeriesByRange<T extends { date: string }>(
  entries: T[],
  range: DateRange,
): T[] {
  if (!range.start || !range.end) return entries
  return entries.filter((entry) => {
    const entryDate = parseDateOnly(entry.date)
    if (!entryDate) return true
    return entryDate >= range.start! && entryDate <= range.end!
  })
}

/** Intersect URL filter range with campaign bounds; null if empty or invalid. */
export function clipDateRangeToCampaign(
  range: DateRange,
  campaignStartStr: string,
  campaignEndStr: string,
): DateRange | null {
  if (!range.start || !range.end) return null
  const cs = parseDateOnly(campaignStartStr)
  const ce = parseDateOnly(campaignEndStr)
  if (!cs || !ce) return null
  const start = new Date(Math.max(cs.getTime(), range.start.getTime()))
  const end = new Date(Math.min(ce.getTime(), range.end.getTime()))
  if (end < start) return null
  return { start, end }
}

/** Detect whether the URL filter range matches the campaign's full duration. */
export function isFullCampaign(filter: DateRange, campaign: CampaignDateBounds): boolean {
  if (!filter.start || !filter.end) return true
  if (!campaign.start || !campaign.end) return true
  return sameDate(filter.start, campaign.start) && sameDate(filter.end, campaign.end)
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

/** First day of calendar month for a spend row / schedule key label. */
export function parseMonthYearLabel(value: string): Date | null {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d{4}[-/]\d{2}$/.test(trimmed)) {
    const sep = trimmed.includes("-") ? "-" : "/"
    const [y, m] = trimmed.split(sep)
    const year = Number(y)
    const monthIdx = Number(m) - 1
    if (!Number.isNaN(year) && monthIdx >= 0 && monthIdx <= 11) {
      return new Date(year, monthIdx, 1)
    }
  }

  if (/^\d{6}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4))
    const monthIdx = Number(trimmed.slice(4, 6)) - 1
    if (!Number.isNaN(year) && monthIdx >= 0 && monthIdx <= 11) {
      return new Date(year, monthIdx, 1)
    }
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const maybeMonth = parts[0].toLowerCase()
    const maybeYear = Number(parts[1])
    const monthIdx = MONTH_NAMES.findIndex((n) => n.startsWith(maybeMonth))
    if (!Number.isNaN(maybeYear) && monthIdx >= 0) {
      return new Date(maybeYear, monthIdx, 1)
    }
  }

  const asDate = new Date(trimmed)
  if (Number.isNaN(asDate.getTime())) return null
  return new Date(asDate.getFullYear(), asDate.getMonth(), 1)
}

function monthOverlapsRange(monthStart: Date, range: DateRange): boolean {
  if (!range.start || !range.end) return true
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  return monthEnd >= range.start && monthStart <= range.end
}

function rowMonthStart(row: Record<string, unknown>): Date | null {
  const raw =
    row.month ??
    row.monthYear ??
    row.month_year ??
    row.date ??
    row.label ??
    row.monthLabel ??
    row.month_label
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  return parseMonthYearLabel(s) ?? parseDateOnly(s)
}

/** Filter monthly spend rows whose calendar month overlaps the range. */
export function filterMonthlySpendByRange(monthlySpend: unknown, range: DateRange): unknown {
  if (!range.start || !range.end) return monthlySpend

  if (Array.isArray(monthlySpend)) {
    return monthlySpend.filter((row) => {
      if (!row || typeof row !== "object") return true
      const monthDate = rowMonthStart(row as Record<string, unknown>)
      if (!monthDate) return true
      return monthOverlapsRange(monthDate, range)
    })
  }

  if (monthlySpend && typeof monthlySpend === "object" && !Array.isArray(monthlySpend)) {
    const out: Record<string, Record<string, number>> = {}
    for (const [monthKey, channels] of Object.entries(monthlySpend as Record<string, unknown>)) {
      const monthDate = parseMonthYearLabel(monthKey) ?? parseDateOnly(monthKey)
      if (!monthDate) {
        out[monthKey] = channels as Record<string, number>
        continue
      }
      if (monthOverlapsRange(monthDate, range)) {
        out[monthKey] = channels as Record<string, number>
      }
    }
    return out
  }

  return monthlySpend
}

function parseAmountLoose(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function lineItemAmount(row: unknown): number {
  if (!row || typeof row !== "object") return 0
  const r = row as Record<string, unknown>
  const candidates = [r.amount, r.totalAmount, r.cost, r.value, r.total, r.budget, r.media_investment, r.spend]
  for (const c of candidates) {
    const n = parseAmountLoose(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

function monthRowTotal(entry: Record<string, unknown>): number {
  const data = entry.data
  if (Array.isArray(data) && data.length > 0) {
    const fromData = data.reduce((sum, row) => sum + lineItemAmount(row), 0)
    if (fromData > 0) return fromData
  }
  const labelKeys = new Set(["monthYear", "month", "date", "label", "id", "month_label", "monthLabel", "data"])
  return Object.entries(entry).reduce((acc, [key, value]) => {
    if (labelKeys.has(key)) return acc
    if (typeof value === "number" && Number.isFinite(value)) return acc + value
    if (typeof value === "string") {
      const n = parseAmountLoose(value)
      return acc + (Number.isFinite(n) ? n : 0)
    }
    return acc
  }, 0)
}

/**
 * Sum channel spend from filtered monthly data for pie / channel totals.
 * Returns the same broad shapes the dashboard already uses.
 */
export function aggregateSpendByChannelFromMonthly(monthlySpend: unknown): Record<string, number> {
  const totals: Record<string, number> = {}

  const add = (channel: string, amount: number) => {
    if (!channel || !Number.isFinite(amount) || amount <= 0) return
    totals[channel] = (totals[channel] || 0) + amount
  }

  if (Array.isArray(monthlySpend)) {
    for (const entry of monthlySpend) {
      if (!entry || typeof entry !== "object") continue
      const e = entry as Record<string, unknown>
      const data = e.data
      if (Array.isArray(data) && data.length > 0) {
        for (const row of data) {
          if (!row || typeof row !== "object") continue
          const li = row as Record<string, unknown>
          const channel = String(li.mediaType ?? li.media_type ?? li.channel ?? "Other")
          add(channel, lineItemAmount(li))
        }
      } else {
        const rowTotal = monthRowTotal(e)
        if (rowTotal <= 0) continue
        const channel = String(e.channel ?? e.mediaType ?? e.media_type ?? "Other")
        add(channel, rowTotal)
      }
    }
    return totals
  }

  if (monthlySpend && typeof monthlySpend === "object" && !Array.isArray(monthlySpend)) {
    for (const [, mediaSpend] of Object.entries(monthlySpend as Record<string, unknown>)) {
      if (!mediaSpend || typeof mediaSpend !== "object") continue
      for (const [mediaType, raw] of Object.entries(mediaSpend as Record<string, unknown>)) {
        add(mediaType, parseAmountLoose(raw))
      }
    }
  }

  return totals
}

/** True if burst interval overlaps [range.start, range.end] (inclusive). */
export function burstOverlapsRange(burst: unknown, range: DateRange): boolean {
  if (!range.start || !range.end) return true
  if (!burst || typeof burst !== "object") return false
  const b = burst as Record<string, unknown>
  const burstStart = parseDateOnly(String(b.startDate ?? b.start_date ?? ""))
  const burstEnd = parseDateOnly(String(b.endDate ?? b.end_date ?? ""))
  if (!burstStart || !burstEnd) return true
  return burstEnd >= range.start && burstStart <= range.end
}

/** Keep line items that have at least one burst overlapping the range; bursts unchanged. */
export function filterLineItemsByBursts(
  lineItems: Record<string, unknown[]>,
  range: DateRange,
): Record<string, unknown[]> {
  if (!range.start || !range.end) return lineItems

  const filtered: Record<string, unknown[]> = {}
  for (const [mediaType, items] of Object.entries(lineItems)) {
    const keptItems = (items ?? []).filter((item) => {
      if (!item || typeof item !== "object") return false
      const bursts = Array.isArray((item as Record<string, unknown>).bursts)
        ? ((item as Record<string, unknown>).bursts as unknown[])
        : []
      if (bursts.length === 0) return true
      return bursts.some((burst) => burstOverlapsRange(burst, range))
    })
    if (keptItems.length > 0) {
      filtered[mediaType] = keptItems
    }
  }
  return filtered
}

/** Filter delivery schedule entries to months overlapping the range. */
export function filterDeliverySchedule(schedule: unknown, range: DateRange): unknown {
  if (!range.start || !range.end) return schedule

  const arr = Array.isArray(schedule)
    ? schedule
    : (() => {
        if (typeof schedule === "string") {
          try {
            const parsed = JSON.parse(schedule)
            return Array.isArray(parsed) ? parsed : null
          } catch {
            return null
          }
        }
        return null
      })()

  if (!arr) return schedule

  return arr.filter((entry: unknown) => {
    if (!entry || typeof entry !== "object") return true
    const e = entry as Record<string, unknown>
    const dateStr =
      e.month ??
      e.month_year ??
      e.monthYear ??
      e.periodStart ??
      e.period_start ??
      e.startDate ??
      e.start_date ??
      e.date
    if (dateStr === null || dateStr === undefined || dateStr === "") return true
    const monthDate = parseMonthYearLabel(String(dateStr)) ?? parseDateOnly(String(dateStr))
    if (!monthDate) return true
    return monthOverlapsRange(monthDate, range)
  })
}

/** Recompute time-elapsed numbers for the selected window vs today. */
export function recomputeTimeMetrics(
  range: DateRange,
  campaignBounds: CampaignDateBounds,
  today: Date = new Date(),
): {
  timeElapsedPct: number
  daysInCampaign: number
  daysElapsed: number
  daysRemaining: number
} {
  const start = range.start ?? campaignBounds.start
  const end = range.end ?? campaignBounds.end

  if (!start || !end) {
    return { timeElapsedPct: 0, daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  }

  const totalMs = end.getTime() - start.getTime()
  const elapsedMs = Math.max(0, today.getTime() - start.getTime())
  const cappedElapsedMs = Math.min(totalMs, elapsedMs)

  const daysInCampaign = Math.max(0, Math.ceil(totalMs / 86_400_000))
  const daysElapsed = Math.max(0, Math.floor(cappedElapsedMs / 86_400_000))
  const daysRemaining = Math.max(0, daysInCampaign - daysElapsed)
  const timeElapsedPct = totalMs > 0 ? (cappedElapsedMs / totalMs) * 100 : 0

  return { timeElapsedPct, daysInCampaign, daysElapsed, daysRemaining }
}
