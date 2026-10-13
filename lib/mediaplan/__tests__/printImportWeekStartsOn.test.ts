/**
 * Dated print bursts land in the week column that contains the day, for any
 * week start. Fixture follows the 13 Oct BOSS010 NP1 read: insertions,
 * buyAmount "$1.00", calculatedValue 3870, single-day local midnights.
 * The cited day is Mon 14 Sep 2026. The other seven days were not listed;
 * they are distinct campaign days so each week is visible.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { projectLumpSumCardBudgetsOntoExpertRows } from "@/lib/mediaplan/cardExpertBudgetSync"
import { weekDayKeys } from "@/lib/mediaplan/expertDayModel"
import {
  mapStandardDigiDisplayLineItemsToExpertRows,
  mapStandardMagazineLineItemsToExpertRows,
  mapStandardNewspaperLineItemsToExpertRows,
  type StandardDigiDisplayLineItemInput,
  type StandardMagazineLineItemInput,
  type StandardNewspaperLineItemInput,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  buildWeeklyGanttColumnsFromCampaign,
  type WeekStartsOn,
  type WeeklyGanttWeekColumn,
} from "@/lib/utils/weeklyGanttColumns"

const CAMPAIGN_START = new Date(2026, 8, 1)
const CAMPAIGN_END = new Date(2027, 5, 30)
const QTY = 3870

/** Eight single-day bursts. First date is the cited Mon 14 Sep 2026. */
const BURST_DAYS: Array<[number, number, number]> = [
  [2026, 9, 14],
  [2026, 9, 23],
  [2026, 10, 2],
  [2026, 10, 13],
  [2026, 10, 22],
  [2026, 11, 2],
  [2026, 11, 18],
  [2026, 12, 4],
]

type PlacedRow = {
  weeklyValues: Record<string, number | "">
  dailyValues?: Record<string, number | "">
  mergedWeekSpans?: Array<{
    startWeekKey: string
    endWeekKey: string
    totalQty: number
  }>
}

function localDay(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

function insertionBursts() {
  return BURST_DAYS.map(([year, month, day]) => {
    const date = localDay(year, month, day)
    return {
      budget: "$3,870",
      buyAmount: "$1.00",
      startDate: date,
      endDate: date,
      calculatedValue: QTY,
    }
  })
}

function qtyInWeek(
  row: PlacedRow,
  col: WeeklyGanttWeekColumn,
  columns: WeeklyGanttWeekColumn[]
): number {
  const weeklyRaw = row.weeklyValues[col.weekKey]
  const weekly =
    weeklyRaw === "" || weeklyRaw === undefined ? 0 : Number(weeklyRaw)
  const dayKeys = weekDayKeys(col, CAMPAIGN_START, CAMPAIGN_END)
  let daily = 0
  for (const key of dayKeys) {
    const value = row.dailyValues?.[key]
    if (typeof value === "number" && Number.isFinite(value)) daily += value
  }
  let span = 0
  const index = columns.findIndex((c) => c.weekKey === col.weekKey)
  for (const merged of row.mergedWeekSpans ?? []) {
    const start = columns.findIndex((c) => c.weekKey === merged.startWeekKey)
    const end = columns.findIndex((c) => c.weekKey === merged.endWeekKey)
    if (start >= 0 && end >= start && index >= start && index <= end) {
      span += merged.totalQty
    }
  }
  return weekly + daily + span
}

function columnForDay(
  columns: WeeklyGanttWeekColumn[],
  date: Date
): WeeklyGanttWeekColumn | undefined {
  const t = date.getTime()
  return columns.find((col) => {
    const start = localDay(
      col.weekStart.getFullYear(),
      col.weekStart.getMonth() + 1,
      col.weekStart.getDate()
    ).getTime()
    const end = localDay(
      col.weekEnd.getFullYear(),
      col.weekEnd.getMonth() + 1,
      col.weekEnd.getDate()
    ).getTime()
    return t >= start && t <= end
  })
}

function assertOwnWeeks(
  label: string,
  row: PlacedRow,
  columns: WeeklyGanttWeekColumn[]
) {
  const placed = columns
    .map((col) => ({ weekKey: col.weekKey, qty: qtyInWeek(row, col, columns) }))
    .filter((entry) => entry.qty !== 0)
  const expected = BURST_DAYS.map(([year, month, day]) => {
    const col = columnForDay(columns, localDay(year, month, day))
    assert.ok(col, `${label} columns must cover ${year}-${month}-${day}`)
    return col.weekKey
  })
  assert.deepEqual(
    placed.map((entry) => entry.weekKey),
    expected,
    `${label} placement: ${JSON.stringify(placed)}`
  )
  for (const entry of placed) {
    assert.equal(entry.qty, QTY, `${label} week ${entry.weekKey}`)
  }
  assert.equal(
    qtyInWeek(row, columns[0]!, columns),
    0,
    `${label} must not add quantity to weekKeys[0]`
  )
}

function importPrint(
  weekStartsOn: WeekStartsOn,
  mapRows: (
    line: StandardNewspaperLineItemInput | StandardMagazineLineItemInput,
    columns: WeeklyGanttWeekColumn[]
  ) => PlacedRow[]
) {
  const columns = buildWeeklyGanttColumnsFromCampaign(
    CAMPAIGN_START,
    CAMPAIGN_END,
    weekStartsOn
  )
  const line = {
    line_item_id: "BOSS010NP1",
    buy_type: "insertions",
    title: "NP1",
    bursts: insertionBursts(),
  }
  const mapped = mapRows(line, columns)
  const [row] = projectLumpSumCardBudgetsOntoExpertRows(
    mapped,
    columns.map((col) => col.weekKey)
  )
  assert.ok(row)
  return { columns, row }
}

for (const weekStartsOn of [0, 1, 2] as const) {
  test(`newspaper insertions: weekStartsOn ${weekStartsOn} keeps 3870 in each burst week`, () => {
    const { columns, row } = importPrint(weekStartsOn, (line, cols) =>
      mapStandardNewspaperLineItemsToExpertRows(
        [line as StandardNewspaperLineItemInput],
        cols,
        CAMPAIGN_START,
        CAMPAIGN_END
      )
    )
    assertOwnWeeks(`newspaper weekStartsOn ${weekStartsOn}`, row, columns)
  })

  test(`magazine insertions: weekStartsOn ${weekStartsOn} keeps 3870 in each burst week`, () => {
    const { columns, row } = importPrint(weekStartsOn, (line, cols) =>
      mapStandardMagazineLineItemsToExpertRows(
        [line as StandardMagazineLineItemInput],
        cols,
        CAMPAIGN_START,
        CAMPAIGN_END
      )
    )
    assertOwnWeeks(`magazine weekStartsOn ${weekStartsOn}`, row, columns)
  })
}

test("digital display Monday week start places each dated burst in its own week", () => {
  const columns = buildWeeklyGanttColumnsFromCampaign(
    CAMPAIGN_START,
    CAMPAIGN_END,
    1
  )
  const days: Array<[number, number, number]> = [
    [2026, 9, 14],
    [2026, 11, 4],
  ]
  const line: StandardDigiDisplayLineItemInput = {
    line_item_id: "BOSS010DD1",
    buy_type: "cpm",
    platform: "DV360",
    bursts: days.map(([year, month, day]) => {
      const date = localDay(year, month, day)
      return {
        budget: "$3,870",
        buyAmount: "$1.00",
        startDate: date,
        endDate: date,
        calculatedValue: QTY,
      }
    }),
  }
  const mapped = mapStandardDigiDisplayLineItemsToExpertRows(
    [line],
    columns,
    CAMPAIGN_START,
    CAMPAIGN_END
  )
  const [row] = projectLumpSumCardBudgetsOntoExpertRows(
    mapped,
    columns.map((col) => col.weekKey)
  )
  assert.ok(row)
  for (const [year, month, day] of days) {
    const col = columnForDay(columns, localDay(year, month, day))
    assert.ok(col)
    assert.equal(qtyInWeek(row, col, columns), QTY, col.weekKey)
  }
  assert.equal(qtyInWeek(row, columns[0]!, columns), 0)
})

test("dated bursts with no imported qty are left alone and warned once", () => {
  const columns = buildWeeklyGanttColumnsFromCampaign(
    CAMPAIGN_START,
    CAMPAIGN_END,
    1
  )
  const weekKeys = columns.map((col) => col.weekKey)
  const weeklyValues: Record<string, number | ""> = {}
  for (const key of weekKeys) weeklyValues[key] = ""
  const warnings: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    const [row] = projectLumpSumCardBudgetsOntoExpertRows(
      [
        {
          buyType: "insertions",
          unitRate: 1,
          grossCost: QTY,
          weeklyValues,
          hasDatedBursts: true,
          sourceLineItemId: "BOSS010NP1",
        },
      ],
      weekKeys
    )
    assert.equal(row!.weeklyValues[weekKeys[0]!], "")
    assert.equal(warnings.length, 1)
    assert.match(String(warnings[0]!.join(" ")), /BOSS010NP1/)

    projectLumpSumCardBudgetsOntoExpertRows(
      [
        {
          buyType: "insertions",
          unitRate: 1,
          grossCost: QTY,
          weeklyValues: { ...weeklyValues },
          hasDatedBursts: true,
          sourceLineItemId: "BOSS010NP1",
        },
      ],
      weekKeys
    )
    assert.equal(warnings.length, 1)
  } finally {
    console.warn = original
  }
})

test("lump-sum row with no dated bursts still fills the first week", () => {
  const columns = buildWeeklyGanttColumnsFromCampaign(CAMPAIGN_START, CAMPAIGN_END, 1)
  const weekKeys = columns.map((col) => col.weekKey)
  const weeklyValues: Record<string, number | ""> = {}
  for (const key of weekKeys) weeklyValues[key] = ""
  const [row] = projectLumpSumCardBudgetsOntoExpertRows(
    [
      {
        buyType: "spots",
        unitRate: "",
        grossCost: 1000,
        weeklyValues,
      },
    ],
    weekKeys
  )
  assert.equal(row!.weeklyValues[weekKeys[0]!], 1)
  assert.equal(row!.unitRate, 1000)
})
