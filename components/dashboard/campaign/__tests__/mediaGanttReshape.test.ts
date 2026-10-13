import assert from "node:assert/strict"
import test from "node:test"

import { ganttLabelFits, ganttLabelWidthPx } from "@/components/charts/system/domain-charts"
import { reshapeLineItemsToMediaGantt } from "../mediaGanttReshape.js"
import { getMediaLabel } from "@/lib/charts/registry"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"

function item(overrides: Partial<NormalisedLineItem> = {}): NormalisedLineItem {
  return {
    lineItemId: "li-1",
    publisher: "Pub",
    mediaType: "search",
    bursts: [
      {
        startDate: "2026-01-05",
        endDate: "2026-03-20",
        deliverables: 1000,
        budget: 10_000,
      },
    ],
    ...overrides,
  } as NormalisedLineItem
}

test("flighting marks an in-range burst active and a finished burst context", () => {
  const today = getMelbourneTodayISO()
  const gantt = reshapeLineItemsToMediaGantt(
    {
      search: [
        item({
          lineItemId: "live",
          bursts: [{ startDate: today, endDate: today, deliverables: 10, deliverablesAmount: 10, budget: 1 }],
        }),
        item({
          lineItemId: "done",
          bursts: [{ startDate: "2000-01-05", endDate: "2000-01-20", deliverables: 10, deliverablesAmount: 10, budget: 1 }],
        }),
      ],
    },
    "2000-01-01",
    "2099-12-31",
    "weekly",
    undefined,
    true,
  )
  assert.ok(gantt)
  const tones = gantt!.rows.map((row) => row.bursts[0]?.tone)
  assert.deepEqual(tones, ["active", "context"])
})

test("weekly month bands follow calendar months (variable week spans)", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item()] },
    "2026-01-01",
    "2026-03-31",
    "weekly",
  )
  assert.ok(gantt)
  assert.ok(gantt!.monthBands)
  const labels = gantt!.monthBands!.map((b) => b.label)
  assert.deepEqual(labels, ["Jan", "Feb", "Mar"])
  const weekSum = gantt!.monthBands!.reduce((s, b) => s + b.weeks, 0)
  assert.equal(weekSum, gantt!.weeks)
  // Equal-width fallacy: Jan/Feb/Mar of 2026 do not all have the same Monday-week count.
  const uniqueSpans = new Set(gantt!.monthBands!.map((b) => b.weeks))
  assert.ok(uniqueSpans.size >= 2, "months must not all share one weeksPerMonth")
})

test("weekly todayWeek lands inside the Monday week columns", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item()] },
    "2026-01-01",
    "2026-12-31",
    "weekly",
  )
  assert.ok(gantt)
  if (gantt!.todayWeek != null) {
    assert.ok(gantt!.todayWeek >= 0)
    assert.ok(gantt!.todayWeek < gantt!.weeks)
  }
})

test("future-start line bar reads Starts {d MMM}", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    {
      search: [
        item({
          bursts: [
            {
              startDate: "2099-03-15",
              endDate: "2099-04-20",
              deliverables: 5000,
              deliverablesAmount: 5000,
              budget: 10_000,
            },
          ],
        }),
      ],
    },
    "2099-01-01",
    "2099-12-31",
    "weekly",
  )
  assert.ok(gantt)
  assert.equal(gantt!.rows[0]?.bursts[0]?.label, "Starts 15 Mar")
})

test("in-flight bar with delivery reads delivered / planned and keeps overflow fillRatio", () => {
  const deliveredByLineId = new Map([["li-1", 400]])
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item()] },
    "2026-01-01",
    "2026-03-31",
    "weekly",
    deliveredByLineId,
  )
  assert.ok(gantt)
  const burst = gantt!.rows[0]?.bursts[0]
  assert.equal(burst?.label, "400 / 1,000")
  assert.equal(burst?.fillRatio, 0.4)
})

test("delivered overflow stays in the label and fillRatio exceeds 1", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item()] },
    "2026-01-01",
    "2026-03-31",
    "weekly",
    new Map([["li-1", 1200]]),
  )
  assert.ok(gantt)
  const burst = gantt!.rows[0]?.bursts[0]
  assert.equal(burst?.label, "1,200 / 1,000")
  assert.equal(burst?.fillRatio, 1.2)
})

test("line absent from delivered map keeps planned-only bar", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item()] },
    "2026-01-01",
    "2026-03-31",
    "weekly",
    new Map([["other-line", 400]]),
  )
  assert.ok(gantt)
  const burst = gantt!.rows[0]?.bursts[0]
  assert.equal(burst?.label, "1,000")
  assert.equal(burst?.fillRatio, undefined)
})

test("monthly view uses the same delivered / planned label", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item()] },
    "2026-01-01",
    "2026-03-31",
    "monthly",
    new Map([["li-1", 250]]),
  )
  assert.ok(gantt)
  const burst = gantt!.rows[0]?.bursts[0]
  assert.equal(burst?.label, "250 / 1,000")
  assert.equal(burst?.fillRatio, 0.25)
})

test("flighting stamps line delivery once, on the burst that contains today", () => {
  const delivered = 10671
  const bursts = [
    { startDate: "2026-06-01", endDate: "2026-06-14", deliverables: 4000, deliverablesAmount: 4000, budget: 1 },
    { startDate: "2026-06-15", endDate: "2026-07-12", deliverables: 3500, deliverablesAmount: 3500, budget: 1 },
    { startDate: "2026-07-13", endDate: "2026-08-09", deliverables: 3000, deliverablesAmount: 3000, budget: 1 },
    { startDate: "2026-08-10", endDate: "2026-10-31", deliverables: 4766, deliverablesAmount: 4766, budget: 1 },
    { startDate: "2026-11-01", endDate: "2026-11-30", deliverables: 5000, deliverablesAmount: 5000, budget: 1 },
    { startDate: "2026-12-01", endDate: "2026-12-20", deliverables: 4500, deliverablesAmount: 4500, budget: 1 },
  ]
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item({ lineItemId: "curatif004", bursts })] },
    "2026-06-01",
    "2026-12-31",
    "weekly",
    new Map([["curatif004", delivered]]),
    true,
  )
  assert.ok(gantt)
  const rowBursts = gantt!.rows[0]!.bursts
  const labels = rowBursts.map((burst) => burst.label ?? "")
  assert.equal(labels.filter((label) => label.includes(" of ")).length, 1)
  assert.equal(labels[3], "10.7K of 24.8K")
  assert.equal(labels[0], "4K planned")
  assert.equal(labels[1], "3.5K planned")
  assert.equal(labels[2], "3K planned")
  assert.equal(labels[4], "Starts 1 Nov")
  assert.equal(labels[5], "Starts 1 Dec")
  assert.equal(rowBursts[3]?.fillRatio, delivered / 24766)
  for (const index of [0, 1, 2, 4, 5]) {
    assert.equal(rowBursts[index]?.fillRatio, undefined)
    assert.equal(rowBursts[index]?.tone, "context")
  }
  assert.equal(rowBursts[3]?.tone, "active")
  const tips = rowBursts.map((burst) => burst.tooltip ?? "")
  assert.ok(tips.every((tip) => tip.includes("planned")))
  assert.match(tips[3] ?? "", /Line delivered to date 10\.7K of 24\.8K/)
  assert.equal(tips.slice(0, 3).some((tip) => tip.includes("Line delivered")), false)
  assert.equal(tips.slice(4).some((tip) => tip.includes("Line delivered")), false)
})

test("flighting puts delivery on the latest started burst when none contains today", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    {
      search: [
        item({
          lineItemId: "gap",
          bursts: [
            { startDate: "2026-01-05", endDate: "2026-01-20", deliverables: 1000, deliverablesAmount: 1000, budget: 1 },
            { startDate: "2026-02-02", endDate: "2026-02-20", deliverables: 2000, deliverablesAmount: 2000, budget: 1 },
            { startDate: "2026-12-01", endDate: "2026-12-20", deliverables: 3000, deliverablesAmount: 3000, budget: 1 },
          ],
        }),
      ],
    },
    "2026-01-01",
    "2026-12-31",
    "weekly",
    new Map([["gap", 400]]),
    true,
  )
  assert.ok(gantt)
  const labels = gantt!.rows[0]!.bursts.map((burst) => burst.label)
  assert.deepEqual(labels, ["1K planned", "400 of 6K", "Starts 1 Dec"])
  assert.equal(gantt!.rows[0]!.bursts[1]?.fillRatio, 400 / 6000)
  assert.equal(gantt!.rows[0]!.bursts[0]?.fillRatio, undefined)
  assert.match(gantt!.rows[0]!.bursts[1]?.tooltip ?? "", /Line delivered to date 400 of 6K/)
})

test("bar label drops when it is wider than the bar minus 12px", () => {
  const starts = "Starts 16 Nov"
  assert.equal(ganttLabelFits(starts, 90), false)
  assert.equal(ganttLabelFits(starts, 120), true)
  const wide = ganttLabelWidthPx("10.7K of 24.8K")
  assert.equal(ganttLabelFits("10.7K of 24.8K", wide + 12), true)
  assert.equal(ganttLabelFits("10.7K of 24.8K", wide + 11), false)
})

test("future-start with no delivery still reads Starts {d MMM}", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    {
      search: [
        item({
          bursts: [
            {
              startDate: "2099-03-15",
              endDate: "2099-04-20",
              deliverables: 5000,
              deliverablesAmount: 5000,
              budget: 10_000,
            },
          ],
        }),
      ],
    },
    "2099-01-01",
    "2099-12-31",
    "weekly",
    new Map(),
  )
  assert.ok(gantt)
  assert.equal(gantt!.rows[0]?.bursts[0]?.label, "Starts 15 Mar")
  assert.equal(gantt!.rows[0]?.bursts[0]?.fillRatio, undefined)
})

test("weekly Oct 2026 labels are the Monday week starts", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item({ bursts: [{ startDate: "2026-10-05", endDate: "2026-10-31", deliverables: 10, deliverablesAmount: 10, budget: 10 }] })] },
    "2026-10-05",
    "2026-10-31",
    "weekly",
  )
  assert.ok(gantt)
  assert.deepEqual(gantt!.weekLabels, ["5 Oct", "12 Oct", "19 Oct", "26 Oct"])
  assert.equal(gantt!.monthBands?.[0]?.label, "Oct")
})

test("monthly view does not add week-start labels", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    { search: [item()] },
    "2026-01-01",
    "2026-03-31",
    "monthly",
  )
  assert.ok(gantt)
  assert.equal(gantt!.weekLabels, undefined)
})

test("every row carries its media channel key and sums in-window burst budgets", () => {
  const gantt = reshapeLineItemsToMediaGantt(
    {
      search: [
        item({ lineItemId: "s1", publisher: "Search one" }),
        item({ lineItemId: "s2", publisher: "Search two" }),
      ],
      television: [
        item({
          lineItemId: "t1",
          publisher: "TV",
          mediaType: "television",
          bursts: [
            { startDate: "2026-01-05", endDate: "2026-01-20", deliverables: 10, deliverablesAmount: 10, budget: 10.1 },
            { startDate: "2026-02-02", endDate: "2026-02-20", deliverables: 10, deliverablesAmount: 10, budget: 20.2 },
            { startDate: "2025-01-01", endDate: "2025-01-10", deliverables: 10, deliverablesAmount: 10, budget: 999 },
          ],
        }),
      ],
    },
    "2026-01-01",
    "2026-03-31",
    "weekly",
  )
  assert.ok(gantt)
  assert.equal(gantt!.rows.length, 3)
  for (const row of gantt!.rows.slice(0, 2)) {
    assert.equal(row.channelKey, "search")
    assert.equal(row.sub, getMediaLabel("search"))
    assert.equal(row.plannedMedia, 10_000)
  }
  assert.equal(gantt!.rows[2]?.channelKey, "television")
  assert.equal(gantt!.rows[2]?.sub, getMediaLabel("television"))
  assert.equal(gantt!.rows[2]?.plannedMedia, 30.3)
})
