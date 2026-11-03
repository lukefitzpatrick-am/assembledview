/**
 * B20 commit 1 (B23fix review finding 1, P14): the client dashboard media
 * gantt reads no unit target from a package line when the package rule is on.
 * Off (or unset, which reads the browser snapshot: off in node): identical.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { addDays, format } from "date-fns"

import { reshapeLineItemsToMediaGantt } from "../mediaGanttReshape.js"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"

function ymd(offsetDays: number): string {
  const [y, m, d] = getMelbourneTodayISO().split("-").map(Number)
  return format(addDays(new Date(y!, m! - 1, d!), offsetDays), "yyyy-MM-dd")
}

function line(lineItemId: string, buyType: string): NormalisedLineItem {
  return {
    lineItemId,
    publisher: "Pub",
    mediaType: "digiDisplay",
    buyType,
    bursts: [
      { startDate: ymd(-40), endDate: ymd(-20), deliverables: 2, deliverablesAmount: 2, budget: 1000 },
      { startDate: ymd(-5), endDate: ymd(5), deliverables: 3, deliverablesAmount: 3, budget: 1000 },
      { startDate: ymd(20), endDate: ymd(30), deliverables: 4, deliverablesAmount: 4, budget: 1000 },
    ],
  } as NormalisedLineItem
}

const delivered = new Map([
  ["pkg1", 50_000],
  ["cpm1", 50_000],
])

function shape(flighting: boolean, granularity: "weekly" | "monthly", on?: boolean, items?: NormalisedLineItem[]) {
  return reshapeLineItemsToMediaGantt(
    { digiDisplay: items ?? [line("pkg1", "package"), line("cpm1", "cpm")] },
    ymd(-60),
    ymd(60),
    granularity,
    delivered,
    flighting,
    ...(on === undefined ? [] : [{ packageNoUnitTarget: on }]),
  )
}

for (const flighting of [true, false]) {
  for (const granularity of ["weekly", "monthly"] as const) {
    test(`off and unset give identical output (flighting ${flighting}, ${granularity})`, () => {
      assert.equal(JSON.stringify(shape(flighting, granularity, false)), JSON.stringify(shape(flighting, granularity)))
    })

    test(`on leaves non-package lines untouched (flighting ${flighting}, ${granularity})`, () => {
      const items = [line("cpm1", "cpm"), line("pkg1", "Package_Inclusions")]
      assert.equal(
        JSON.stringify(shape(flighting, granularity, true, items)),
        JSON.stringify(shape(flighting, granularity, false, items)),
      )
    })
  }
}

test("off: a package line still reads its quantity as a target (today's behaviour)", () => {
  const gantt = shape(true, "weekly", false)!
  const pkg = gantt.rows[0]!.bursts
  const carrier = pkg.find((b) => b.fillRatio !== undefined)
  assert.ok(carrier)
  assert.equal(carrier!.label, "50K of 9")
  assert.ok(carrier!.fillRatio! > 1)
})

test("on, flighting: package carrier reads delivered only, no fill ratio, no 'planned' count", () => {
  const gantt = shape(true, "weekly", true)!
  const [pkgRow, cpmRow] = gantt.rows
  const labels = pkgRow!.bursts.map((b) => b.label ?? "")
  assert.equal(labels.filter((l) => l.includes(" of ")).length, 0)
  assert.ok(labels.includes("50K delivered"))
  for (const b of pkgRow!.bursts) {
    assert.equal(b.fillRatio, undefined)
    assert.ok(!(b.tooltip ?? "").includes("planned"), b.tooltip)
    assert.ok(!(b.label ?? "").includes("planned"), b.label)
  }
  // Past burst falls back to its date span.
  assert.match(labels[0]!, /^\d{1,2}\/\d{1,2}–\d{1,2}\/\d{1,2}$/)
  // The CPM line beside it keeps "X of Y" and its fill ratio.
  const cpmCarrier = cpmRow!.bursts.find((b) => b.fillRatio !== undefined)
  assert.equal(cpmCarrier?.label, "50K of 9")
})

test("on, not flighting: package bars read delivered only, no fill ratio", () => {
  for (const granularity of ["weekly", "monthly"] as const) {
    const gantt = shape(false, granularity, true)!
    const pkgRow = gantt.rows[0]!
    for (const b of pkgRow.bursts) {
      assert.equal(b.label, "50,000 delivered")
      assert.equal(b.fillRatio, undefined)
      assert.equal(b.intensity, 0.75)
    }
    const cpmRow = gantt.rows[1]!
    assert.equal(cpmRow.bursts[0]!.label, "50,000 / 9")
  }
})

test("on, package line without delivery shows its dates, never a quantity", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { digiDisplay: [line("pkg-none", "package")] },
    ymd(-60),
    ymd(60),
    "weekly",
    new Map(),
    false,
    { packageNoUnitTarget: true },
  )!
  for (const b of gantt.rows[0]!.bursts) {
    assert.ok(!/^\d+$/.test(b.label ?? ""), b.label)
  }
})
