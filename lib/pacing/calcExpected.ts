import { Burst } from "./mockMetaPacing"

export type ExpectedDay = {
  date: string
  expected_spend: number
  expected_deliverables: number
}

export type ExpectedSeries = {
  date: string
  cumulative_expected_spend: number
  cumulative_expected_deliverables: number
}

export type ExpectedResult = {
  daily: ExpectedDay[]
  cumulative: ExpectedSeries[]
  totals: {
    spend: number
    deliverables: number
  }
}

export function calcExpectedFromBursts(bursts: Burst[]): ExpectedResult {
  const dailyMap = new Map<string, { spend: number; deliverables: number }>()
  const totals = { spend: 0, deliverables: 0 }

  bursts.forEach((burst) => {
    const dates = expandDateRange(burst.start_date, burst.end_date)
    if (!dates.length) return

    const spendPerDay = burst.media_investment / dates.length
    const deliverablesPerDay = burst.deliverables / dates.length
    totals.spend += burst.media_investment
    totals.deliverables += burst.deliverables

    dates.forEach((date) => {
      const existing = dailyMap.get(date) ?? { spend: 0, deliverables: 0 }
      dailyMap.set(date, {
        spend: existing.spend + spendPerDay,
        deliverables: existing.deliverables + deliverablesPerDay,
      })
    })
  })

  const daily = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({
      date,
      expected_spend: Number(values.spend.toFixed(2)),
      expected_deliverables: Number(values.deliverables.toFixed(2)),
    }))

  let runningSpend = 0
  let runningDeliverables = 0
  const cumulative = daily.map((day) => {
    runningSpend += day.expected_spend
    runningDeliverables += day.expected_deliverables
    return {
      date: day.date,
      cumulative_expected_spend: Number(runningSpend.toFixed(2)),
      cumulative_expected_deliverables: Number(runningDeliverables.toFixed(2)),
    }
  })

  return {
    daily,
    cumulative,
    totals: {
      spend: Number(totals.spend.toFixed(2)),
      deliverables: Number(totals.deliverables.toFixed(2)),
    },
  }
}

function expandDateRange(start: string, end: string): string[] {
  const startDate = new Date(start + "T00:00:00Z")
  const endDate = new Date(end + "T00:00:00Z")
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return []
  if (startDate > endDate) return []

  const dates: string[] = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}
