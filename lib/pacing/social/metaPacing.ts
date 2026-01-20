export type MetaPacingRow = {
  channel?: string
  dateDay: string
  adsetName: string
  lineItemId?: string
  campaignId?: string
  campaignName?: string
  adsetId?: string
  amountSpent?: number
  impressions?: number
  clicks?: number
  results?: number
  video3sViews?: number
}

type DailySummary = {
  dateDay: string
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
}

export function normalisePlatform(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export function buildSuffix(lineItemId: string) {
  return `-${String(lineItemId ?? "").trim()}`
}

export function matchRowsForLineItem(rows: MetaPacingRow[], lineItemId: string) {
  const normalizedId = String(lineItemId ?? "").trim().toLowerCase()
  const suffix = buildSuffix(lineItemId).toLowerCase()
  return rows.filter((row) => {
    const adsetId = String(row.adsetId ?? "").toLowerCase()
    if (normalizedId && adsetId && adsetId === normalizedId) return true
    const name = String(row.adsetName ?? "").toLowerCase()
    return Boolean(name && suffix && (name.endsWith(suffix) || name.includes(suffix)))
  })
}

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

export function calcDateWindow(startDate?: string, endDate?: string, today?: Date) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end || end < start) {
    return { totalDays: 0, daysElapsed: 0 }
  }

  const normalizedToday = today ? new Date(today) : new Date()
  normalizedToday.setHours(0, 0, 0, 0)
  const asAt = normalizedToday < end ? normalizedToday : end
  if (asAt < start) {
    return { totalDays: diffDays(start, end) + 1, daysElapsed: 0 }
  }

  return {
    totalDays: diffDays(start, end) + 1,
    daysElapsed: diffDays(start, asAt) + 1,
  }
}

export function calcExpectedSpendToDate(bookedBudget: number, totalDays: number, daysElapsed: number) {
  if (!totalDays || totalDays <= 0) return 0
  return (bookedBudget / totalDays) * daysElapsed
}

export function summariseDelivery(
  rows: MetaPacingRow[],
  startDate?: string,
  endDate?: string,
  today: Date = new Date()
) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end || end < start) {
    return {
      amountSpentToDate: 0,
      impressionsToDate: 0,
      clicksToDate: 0,
      resultsToDate: 0,
      daily: [] as DailySummary[],
    }
  }

  const normalizedToday = new Date(today)
  normalizedToday.setHours(0, 0, 0, 0)
  const asAt = normalizedToday < end ? normalizedToday : end

  const dailyMap = new Map<string, DailySummary>()
  let amountSpentToDate = 0
  let impressionsToDate = 0
  let clicksToDate = 0
  let resultsToDate = 0
  let video3sViewsToDate = 0

  rows.forEach((row) => {
    const date = parseDate(row.dateDay)
    if (!date) return
    if (date < start || date > end) return
    const dateKey = date.toISOString().slice(0, 10)
    const existing = dailyMap.get(dateKey) ?? {
      dateDay: dateKey,
      amountSpent: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      video3sViews: 0,
    }

    const amountSpent = Number(row.amountSpent ?? 0)
    const impressions = Number(row.impressions ?? 0)
    const clicks = Number(row.clicks ?? 0)
    const results = Number(row.results ?? 0)
    const video3sViews = Number(row.video3sViews ?? 0)

    dailyMap.set(dateKey, {
      ...existing,
      amountSpent: existing.amountSpent + amountSpent,
      impressions: existing.impressions + impressions,
      clicks: existing.clicks + clicks,
      results: existing.results + results,
      video3sViews: existing.video3sViews + video3sViews,
    })

    if (date <= asAt) {
      amountSpentToDate += amountSpent
      impressionsToDate += impressions
      clicksToDate += clicks
      resultsToDate += results
      video3sViewsToDate += video3sViews
    }
  })

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.dateDay.localeCompare(b.dateDay))

  return {
    amountSpentToDate,
    impressionsToDate,
    clicksToDate,
    resultsToDate,
    video3sViewsToDate,
    daily,
  }
}

function diffDays(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime()
  return Math.floor(diff / (24 * 60 * 60 * 1000))
}
