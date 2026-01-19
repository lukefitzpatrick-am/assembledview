import { ExpectedResult } from "./calcExpected"
import { ActualsDaily, BuyType } from "./mockMetaPacing"

type DeliverableKey =
  | "impressions"
  | "clicks"
  | "video_3s_views"
  | "results"
  | "deliverable_value"

export type PacingSeriesPoint = {
  date: string
  expectedSpend: number
  actualSpend: number
  expectedDeliverable: number
  actualDeliverable: number
}

export type PacingResult = {
  asAtDate: string | null
  spend: {
    actualToDate: number
    expectedToDate: number
    delta: number
    pacingPct: number
    goalTotal: number
  }
  deliverable?: {
    actualToDate: number
    expectedToDate: number
    delta: number
    pacingPct: number
    goalTotal: number
  }
  series: PacingSeriesPoint[]
}

export function calculatePacing(params: {
  buyType: BuyType
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[]
  expected: ExpectedResult
  deliverableKeyOverride?: DeliverableKey | null
  asAtDate?: string
}): PacingResult {
  const { buyType, actualsDaily, expected, deliverableKeyOverride, asAtDate } =
    params

  const deliverableKey = deliverableKeyOverride ?? getDeliverableKey(buyType)
  const sortedActuals = [...actualsDaily].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  const expectedDailyMap = new Map<
    string,
    { spend: number; deliverable: number }
  >()
  expected.daily.forEach((day) => {
    expectedDailyMap.set(day.date, {
      spend: day.expected_spend,
      deliverable: day.expected_deliverables,
    })
  })
  const actualDailyMap = new Map<string, { spend: number; deliverable: number }>()
  sortedActuals.forEach((day) => {
    const deliverableValue = deliverableKey
      ? getDeliverableValue(day, deliverableKey)
      : 0
    actualDailyMap.set(day.date, {
      spend: day.spend,
      deliverable: deliverableValue,
    })
  })

  const actualAsAt =
    asAtDate ||
    (sortedActuals.length
      ? sortedActuals[sortedActuals.length - 1].date
      : null)

  const actualCumulative = new Map<
    string,
    { spend: number; deliverable: number }
  >()

  let runningSpend = 0
  let runningDeliverable = 0
  sortedActuals.forEach((day) => {
    runningSpend += day.spend
    if (deliverableKey) {
      runningDeliverable += getDeliverableValue(day, deliverableKey)
    }
    actualCumulative.set(day.date, {
      spend: Number(runningSpend.toFixed(2)),
      deliverable: Number(runningDeliverable.toFixed(2)),
    })
  })

  const expectedCumulative = expected.cumulative
  const expectedTotals =
    expectedCumulative.length > 0
      ? expectedCumulative[expectedCumulative.length - 1]
      : null

  const expectedAsAt = actualAsAt
    ? expectedCumulative.filter((point) => point.date <= actualAsAt).pop() ??
      expectedTotals
    : expectedTotals

  const actualAsAtValues =
    actualAsAt && actualCumulative.size
      ? findLatestOnOrBefore(actualCumulative, actualAsAt)
      : { spend: 0, deliverable: 0 }

  const spendGoalTotal = Number(expected.totals?.spend ?? 0)
  const expectedSpendToDateRaw = expectedAsAt?.cumulative_expected_spend || 0
  const expectedSpendToDate = clampToTotal(expectedSpendToDateRaw, spendGoalTotal)
  const actualSpendToDate = clampToTotal(actualAsAtValues?.spend || 0, spendGoalTotal)
  const spendDelta = actualSpendToDate - expectedSpendToDate
  const spendPacing =
    expectedSpendToDate > 0 ? (actualSpendToDate / expectedSpendToDate) * 100 : 0

  const deliverableGoalTotal = Number(expected.totals?.deliverables ?? 0)
  const deliverableExpectedRaw =
    expectedAsAt?.cumulative_expected_deliverables || 0
  const deliverableExpected = clampToTotal(
    deliverableExpectedRaw,
    deliverableGoalTotal
  )
  const deliverableActual = clampToTotal(
    actualAsAtValues?.deliverable || 0,
    deliverableGoalTotal
  )
  const deliverableDelta = deliverableActual - deliverableExpected
  const deliverablePacing =
    deliverableExpected > 0 ? (deliverableActual / deliverableExpected) * 100 : 0

  const series = buildDailySeries({
    expectedDailyMap,
    actualDailyMap,
    deliverableKeyExists: Boolean(deliverableKey),
  })

  const result: PacingResult = {
    asAtDate: actualAsAt,
    spend: {
      actualToDate: Number(actualSpendToDate.toFixed(2)),
      expectedToDate: Number(expectedSpendToDate.toFixed(2)),
      delta: Number(spendDelta.toFixed(2)),
      pacingPct: Number(spendPacing.toFixed(2)),
      goalTotal: Number(spendGoalTotal.toFixed(2)),
    },
    series,
  }

  if (deliverableKey) {
    result.deliverable = {
      actualToDate: Number(deliverableActual.toFixed(2)),
      expectedToDate: Number(deliverableExpected.toFixed(2)),
      delta: Number(deliverableDelta.toFixed(2)),
      pacingPct: Number(deliverablePacing.toFixed(2)),
      goalTotal: Number(deliverableGoalTotal.toFixed(2)),
    }
  }

  return result
}

export function getDeliverableKey(buyType: BuyType): DeliverableKey | null {
  switch (buyType) {
    case "CPM":
      return "impressions"
    case "CPC":
      return "clicks"
    case "CPA":
      return "results"
    case "CPV":
      return "video_3s_views"
    case "LEADS":
    case "BONUS":
      return "results"
    case "FIXED COST":
      return null
    case "SUMMARY":
      return "deliverable_value"
    default:
      return null
  }
}

function getDeliverableValue(
  day: ActualsDaily & { deliverable_value?: number },
  key: DeliverableKey
): number {
  if (key === "deliverable_value") {
    return day.deliverable_value ?? 0
  }
  return (day as Record<string, number>)[key] || 0
}

function findLatestOnOrBefore(
  map: Map<string, { spend: number; deliverable: number }>,
  date: string
) {
  const sorted = Array.from(map.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  let latest: { spend: number; deliverable: number } | undefined
  for (const [d, value] of sorted) {
    if (d <= date) {
      latest = value
    } else {
      break
    }
  }
  return latest ?? { spend: 0, deliverable: 0 }
}

function buildDailySeries({
  expectedDailyMap,
  actualDailyMap,
  deliverableKeyExists,
}: {
  expectedDailyMap: Map<string, { spend: number; deliverable: number }>
  actualDailyMap: Map<string, { spend: number; deliverable: number }>
  deliverableKeyExists: boolean
}): PacingSeriesPoint[] {
  const allDates = [
    ...Array.from(expectedDailyMap.keys()),
    ...Array.from(actualDailyMap.keys()),
  ].sort((a, b) => a.localeCompare(b))

  if (!allDates.length) return []

  const firstDate = allDates[0]
  const lastDate = allDates[allDates.length - 1]

  const dateRange: string[] = []
  for (
    let cursor = new Date(firstDate + "T00:00:00Z");
    cursor <= new Date(lastDate + "T00:00:00Z");
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dateRange.push(cursor.toISOString().slice(0, 10))
  }

  return dateRange.map((date) => {
    const expected = expectedDailyMap.get(date) ?? { spend: 0, deliverable: 0 }
    const actual = actualDailyMap.get(date) ?? { spend: 0, deliverable: 0 }
    return {
      date,
      expectedSpend: Number(expected.spend.toFixed(2)),
      actualSpend: Number(actual.spend.toFixed(2)),
      expectedDeliverable: deliverableKeyExists
        ? Number(expected.deliverable.toFixed(2))
        : 0,
      actualDeliverable: deliverableKeyExists
        ? Number(actual.deliverable.toFixed(2))
        : 0,
    }
  })
}

function clampToTotal(value: number, total: number) {
  if (total > 0) {
    return Math.min(value, total)
  }
  return value
}
