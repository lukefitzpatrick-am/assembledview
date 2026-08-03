/**
 * CHARACTERISATION TEST — documents CURRENT (buggy) Apply behaviour.
 *
 * Hypothesis: ExpertGrid rebuckets row.weeklyValues onto Monday week keys when the
 * user switches weekStartsOn, then pushes those rows to the parent via onRowsChange.
 * Containers still build Apply columns with buildWeeklyGanttColumnsFromCampaign(start, end)
 * (default weekStartsOn=0 = Sunday). mapOohExpertRowsToStandardLineItems then looks up
 * row.weeklyValues[col.weekKey] with Sunday keys → undefined → quantity silently dropped.
 *
 * When the gated weekStartsOn fix pack lands, flip the Apply-with-Sunday assertion to
 * expect conserved quantities (or delete this file in favour of a green parity suite).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { rebucketRowsForWeekStartsOn } from "@/lib/mediaplan/expertDayModel"
import { mapOohExpertRowsToStandardLineItems } from "@/lib/mediaplan/expertChannelMappings"
import type { OohExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const CS = new Date(2026, 0, 4) // Sun 4 Jan 2026
const CE = new Date(2026, 0, 31)

function baseOohRow(
  weeklyValues: OohExpertScheduleRow["weeklyValues"]
): OohExpertScheduleRow {
  return {
    id: "MBA-OH-1",
    market: "SYD",
    network: "Net",
    format: "Billboard",
    type: "Static",
    placement: "CBD",
    startDate: "2026-01-04",
    endDate: "2026-01-10",
    size: "6x3",
    panels: "",
    buyingDemo: "P25-54",
    buyType: "panels",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 100,
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

test("CHARACTERISATION (buggy): Monday-rebucketed OOH qty is dropped when Apply uses Sunday columns", () => {
  const sundayCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const mondayCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)
  assert.notEqual(
    sundayCols[0]!.weekKey,
    mondayCols[0]!.weekKey,
    "fixture requires distinct Sunday vs Monday week keys"
  )

  const sundayWeekly: OohExpertScheduleRow["weeklyValues"] = {}
  for (const c of sundayCols) sundayWeekly[c.weekKey] = ""
  sundayWeekly[sundayCols[0]!.weekKey] = 10

  const [rebucketed] = rebucketRowsForWeekStartsOn(
    [baseOohRow(sundayWeekly)],
    sundayCols,
    mondayCols
  )
  assert.ok(rebucketed)

  // Quantities survive on Monday keys (grid state after weekStartsOn change).
  const mondayQtyTotal = Object.values(rebucketed.weeklyValues).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
  assert.equal(mondayQtyTotal, 10)

  // Apply path as containers do today: Sunday default columns + Monday-keyed rows.
  const [line] = mapOohExpertRowsToStandardLineItems(
    [rebucketed],
    sundayCols,
    CS,
    CE
  )
  assert.ok(line)

  const appliedQty = line.bursts.reduce(
    (s, b) => s + (Number(b.calculatedValue) || 0),
    0
  )
  // CURRENT BUG: Sunday col.weekKey lookups miss Monday keys → no bursts / zero qty.
  assert.equal(
    appliedQty,
    0,
    "characterises silent qty drop when Apply columns disagree with rebucketed keys"
  )
  assert.equal(
    line.bursts.every((b) => !b.budget || b.budget === "0" || Number(b.calculatedValue) === 0) ||
      line.bursts.length === 1,
    true
  )
  // emptyOohLineItem placeholder when no weeks matched: single empty burst, calculatedValue 0
  assert.equal(line.bursts[0]!.calculatedValue, 0)
})

test("control: same Monday-rebucketed rows Apply correctly against Monday columns", () => {
  const sundayCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const mondayCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)

  const sundayWeekly: OohExpertScheduleRow["weeklyValues"] = {}
  for (const c of sundayCols) sundayWeekly[c.weekKey] = ""
  sundayWeekly[sundayCols[0]!.weekKey] = 10

  const [rebucketed] = rebucketRowsForWeekStartsOn(
    [baseOohRow(sundayWeekly)],
    sundayCols,
    mondayCols
  )
  assert.ok(rebucketed)

  const [line] = mapOohExpertRowsToStandardLineItems(
    [rebucketed],
    mondayCols,
    CS,
    CE
  )
  assert.ok(line)
  const appliedQty = line.bursts.reduce(
    (s, b) => s + (Number(b.calculatedValue) || 0),
    0
  )
  assert.equal(appliedQty, 10)
})

test("CHARACTERISATION: rebucketRowsForWeekStartsOn clears mergedWeekSpans", () => {
  const sundayCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const mondayCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 1)
  const weeklyValues: OohExpertScheduleRow["weeklyValues"] = {}
  for (const c of sundayCols) weeklyValues[c.weekKey] = ""

  const [next] = rebucketRowsForWeekStartsOn(
    [
      {
        ...baseOohRow(weeklyValues),
        mergedWeekSpans: [
          {
            startWeekKey: sundayCols[0]!.weekKey,
            endWeekKey: sundayCols[1]!.weekKey,
            totalQty: 140,
          },
        ],
      },
    ],
    sundayCols,
    mondayCols
  )
  assert.ok(next)
  assert.deepEqual(next.mergedWeekSpans, [])
  const total = Object.values(next.weeklyValues).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
  assert.equal(total, 140)
})
