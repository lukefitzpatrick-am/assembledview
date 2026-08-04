/**
 * Apply parity: ExpertGrid rebuckets onto Monday week keys when weekStartsOn=1;
 * containers that own the same weekStartsOn state must build Apply columns with
 * matching keys so quantities are conserved.
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

test("Apply parity: Monday-rebucketed OOH qty conserved when Apply uses Monday columns", () => {
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

  const mondayQtyTotal = Object.values(rebucketed.weeklyValues).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0
  )
  assert.equal(mondayQtyTotal, 10)

  // Fixed Apply path: same weekStartsOn as the grid (Monday columns).
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
  assert.equal(
    appliedQty,
    10,
    "Apply columns must match rebucketed Monday keys so qty is conserved"
  )
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

test("Sunday default unchanged: Sunday-keyed rows Apply with Sunday columns keep qty 10", () => {
  const sundayCols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)

  const sundayWeekly: OohExpertScheduleRow["weeklyValues"] = {}
  for (const c of sundayCols) sundayWeekly[c.weekKey] = ""
  sundayWeekly[sundayCols[0]!.weekKey] = 10

  const [line] = mapOohExpertRowsToStandardLineItems(
    [baseOohRow(sundayWeekly)],
    sundayCols,
    CS,
    CE
  )
  assert.ok(line)
  const appliedQty = line.bursts.reduce(
    (s, b) => s + (Number(b.calculatedValue) || 0),
    0
  )
  assert.equal(
    appliedQty,
    10,
    "Sunday-default Apply path must behave exactly as before the controlled lift"
  )
})
