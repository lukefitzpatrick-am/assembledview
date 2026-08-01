import assert from "node:assert/strict"
import test from "node:test"

import { reshapeLineItemsToMediaGantt } from "../mediaGanttReshape.js"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"

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
  // Equal-width fallacy: Jan/Feb/Mar of 2026 do not all have the same Sunday-week count.
  const uniqueSpans = new Set(gantt!.monthBands!.map((b) => b.weeks))
  assert.ok(uniqueSpans.size >= 2, "months must not all share one weeksPerMonth")
})

test("weekly todayWeek lands on a sun-week index", () => {
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
