import "@/lib/testing/bothZones"
/**
 * C371 (V104 A, C-370 (4)): Production on its bare load shape (cost, amount,
 * dates; no budget, as a burst saved before the dual-write gives). The carry
 * reads cost x amount as the
 * saved budget, so an untouched Apply gives every burst back as saved and a
 * burst outside the campaign is never dropped. An edited group is priced from
 * the grid (unit rate x quantity). The shared shell also mirrors the money
 * keys onto each form burst (W5l), so the last test of each grid pins that
 * the carry is the same either way. Live shapes: a burst before the campaign
 * (glenda001 13492, QATAR001 13504, PGAAUS010 13560, hartm002 13582), two
 * bursts at different costs (TheY001 53240), monthly bursts (candel001 13717),
 * one burst over many weeks (candel003 13568). Sunday and Monday grids, both
 * zones.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { format } from "date-fns"

import * as M from "@/lib/mediaplan/expertChannelMappings"
import { productionHydrateLine } from "@/lib/mediaplan/productionLine"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowCostSplit } from "@/lib/mediaplan/expertRowCost"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const START = new Date(2026, 2, 1)
const END = new Date(2026, 5, 30)
const d = (s: string) => new Date(`${s}T00:00:00`)
const burst = (cost: number, amount: number, s: string, e: string) => ({ cost, amount, startDate: d(s), endDate: d(e) })
/** Production's bare load: cost, amount and Date dates per burst, no budget. */
const lineOf = (bursts: ReturnType<typeof burst>[]) => ({ mediaType: "Production", publisher: "Studio", description: "Edit", market: "National", unitRate: bursts[0]!.cost, buyType: "production", line_item_id: "c371p", lineItemId: "c371p", line_item: 1, lineItem: 1, bursts })
/** A burst as [cents, amount, dates], in date order. */
const read = (l: any) => [...l.bursts].map((b: any) => [Math.round(Number(b.cost) * Number(b.amount) * 100), Number(b.amount), `${format(b.startDate, "yyyy-MM-dd")}..${format(b.endDate, "yyyy-MM-dd")}`] as const).sort((a, b) => a[2].localeCompare(b[2]))
const sumCents = (l: any) => read(l).reduce((s, b) => s + b[0], 0)

function run(saved: any, wso: 0 | 1, edit?: (row: any) => void) {
  const cols = buildWeeklyGanttColumnsFromCampaign(START, END, wso)
  const rows = M.mapStandardProductionLineItemsToExpertRows([saved], cols, START, END)
  edit?.(rows[0] as any)
  const grid = Math.round(expertRowCostSplit(rows[0] as any, cols.map((c) => c.weekKey), 0).raw * 100)
  const applied = S.mergeProductionStandardFromExpertWithPrevious(M.mapProductionExpertRowsToStandardLineItems(rows, cols, START, END), [saved])[0]
  return { row: rows[0] as any, grid, applied }
}
/** +1 on the first week or day cell holding a quantity. */
function bumpFirst(row: any) {
  const week = Object.keys(row.weeklyValues).sort().find((k) => Number(row.weeklyValues[k]) > 0)
  const dayKey = Object.keys(row.dailyValues ?? {}).sort().find((k) => Number(row.dailyValues[k]) > 0)
  if (week && (!dayKey || week <= dayKey)) row.weeklyValues[week] = Number(row.weeklyValues[week]) + 1
  else row.dailyValues[dayKey!] = Number(row.dailyValues[dayKey!]) + 1
}

/**
 * The shared shell's load (W5l): the same saved bursts through Production's own
 * hydrate, which mirrors the money keys onto each form burst. Built by the real
 * code, so a wrong money key shows up here as a dropped or re-priced carry.
 */
const shellLoad = (saved: ReturnType<typeof lineOf>) =>
  productionHydrateLine(
    { ...saved, bursts: [] } as never,
    saved as never,
    { feePct: 0, mbaNumber: "tst001", campaignStartDate: START, campaignEndDate: END, index: 0 },
  ) as unknown as ReturnType<typeof lineOf>

const SHAPES = [
  { name: "a burst before the campaign beside one inside it (glenda001 13492 shape)", saved: lineOf([burst(10_000, 1, "2026-01-25", "2026-01-26"), burst(10_000, 1, "2026-03-10", "2026-03-10")]) },
  { name: "a lone burst before the campaign (QATAR001 13504 shape)", saved: lineOf([burst(750, 1, "2026-02-22", "2026-02-22")]), noCell: true },
  { name: "a burst after the campaign end", saved: lineOf([burst(3_960, 2, "2026-03-02", "2026-03-20"), burst(3_960, 1, "2026-07-10", "2026-07-10")]) },
  { name: "two bursts at different costs (TheY001 53240 shape)", saved: lineOf([burst(13_198, 1, "2026-03-02", "2026-03-03"), burst(13_000, 1, "2026-05-11", "2026-05-12")]) },
  { name: "monthly bursts (candel001 13717 shape)", saved: lineOf([burst(250, 1, "2026-03-01", "2026-03-31"), burst(250, 1, "2026-04-01", "2026-04-30"), burst(250, 1, "2026-05-01", "2026-05-31"), burst(250, 1, "2026-06-01", "2026-06-30")]) },
  { name: "one burst over many weeks (candel003 13568 shape)", saved: lineOf([burst(250, 11, "2026-03-01", "2026-06-29")]) },
]

for (const wso of [0, 1] as const) {
  const grid = wso ? "Monday" : "Sunday"
  for (const { name, saved, noCell } of SHAPES) {
    test(`Production, ${grid} grid: ${name} comes back as saved untouched (V104 A)`, () => {
      const { grid: money, applied } = run(saved, wso)
      assert.deepEqual(read(applied), read(saved))
      assert.equal(money, sumCents(saved))
    })

    if (!noCell) test(`Production, ${grid} grid: ${name}, first cell edited: the edited group is priced from the grid and grid = Apply (V104 A)`, () => {
      const { grid: money, applied } = run(saved, wso, bumpFirst)
      assert.equal(money, sumCents(applied))
      assert.ok(sumCents(applied) > sumCents(saved))
    })
  }

  test(`Production, ${grid} grid: TheY001 53240 shape, first week edited: the untouched second burst keeps its own cost (V104 A)`, () => {
    const { applied } = run(SHAPES[3]!.saved, wso, bumpFirst)
    assert.deepEqual(read(applied).filter((b) => b[2] === "2026-05-11..2026-05-12"), [[1_300_000, 1, "2026-05-11..2026-05-12"]])
  })

  test(`Production, ${grid} grid: the shared shell's load, with the money keys mirrored, carries exactly as the bare shape (W5l)`, () => {
    for (const { name, saved } of SHAPES) {
      const bare = run(saved, wso)
      const mir = run(shellLoad(saved), wso)
      assert.deepEqual(read(mir.applied), read(bare.applied), name)
      assert.equal(mir.grid, bare.grid, name)
    }
  })

  test(`Production, ${grid} grid: the shared shell's load, first cell edited, prices from the grid as the bare shape does (W5l)`, () => {
    for (const { name, saved, noCell } of SHAPES) {
      if (noCell) continue
      const bare = run(saved, wso, bumpFirst)
      const mir = run(shellLoad(saved), wso, bumpFirst)
      assert.deepEqual(read(mir.applied), read(bare.applied), name)
      assert.equal(mir.grid, bare.grid, name)
    }
  })
}
