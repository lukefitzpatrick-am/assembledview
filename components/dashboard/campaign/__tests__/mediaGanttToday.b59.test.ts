/**
 * B59 (C-277, S9 A): the campaign flighting Gantt places its today marker
 * column (`todayWeek`) on the Melbourne day, the same day as `todayDay` and
 * the burst tones, not the viewer's day. It runs in the browser; this file
 * runs in both zones: Melbourne, then UTC, which stands in for a viewer
 * outside Melbourne (a host-day revert passes in Melbourne and fails there).
 * The clock is mocked where the UTC day is the day before:
 *   - 30 Nov 2026 21:00Z, Tue 1 Dec 08:00 AEDT (UTC Mon 30 Nov);
 *   - 30 Jun 2026 21:00Z, Wed 1 Jul 07:00 AEST (UTC Tue 30 Jun).
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import { reshapeLineItemsToMediaGantt } from "../mediaGanttReshape.js"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", start: "2026-11-01", end: "2026-12-31", monday: "30", dayInWeek: 1, month: 1, label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", start: "2026-06-01", end: "2026-07-31", monday: "29", dayInWeek: 2, month: 1, label: "1 Jul 07:00 AEST" },
] as const

function line(start: string, end: string): NormalisedLineItem {
  return {
    lineItemId: "li-1",
    publisher: "Pub",
    mediaType: "search",
    bursts: [{ startDate: start, endDate: end, deliverables: 1000, budget: 10_000 }],
  } as NormalisedLineItem
}

for (const { at, start, end, monday, dayInWeek, month, label } of INSTANTS) {
  test(`weekly: the today marker sits on the Melbourne day (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const gantt = reshapeLineItemsToMediaGantt({ search: [line(start, end)] }, start, end, "weekly")
    assert.ok(gantt && gantt.todayWeek != null)
    const week = Math.floor(gantt.todayWeek)
    assert.equal(gantt.weekLabels?.[week], monday)
    assert.ok(Math.abs(gantt.todayWeek - week - dayInWeek / 7) < 1e-9, `todayWeek ${gantt.todayWeek}`)
  })

  test(`monthly: the today marker is in the Melbourne month (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const gantt = reshapeLineItemsToMediaGantt({ search: [line(start, end)] }, start, end, "monthly")
    assert.ok(gantt && gantt.todayWeek != null)
    assert.equal(Math.floor(gantt.todayWeek), month)
  })
}
