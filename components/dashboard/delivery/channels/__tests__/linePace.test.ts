/**
 * Programmatic and social line pace: a line with clicks and no impressions
 * reads "No impression tracking", the same label as Direct Booked Digital
 * (REP-5; Luke, 29 Oct 2026).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { NO_IMPRESSION_TRACKING, resolvePacingWindowISO } from "@/lib/pacing/expectedForWindow"

import { computeLinePace, countsTowardsCpm, sumLinePaces, untrackedLineNote, untrackedNote } from "../linePace"

const window = resolvePacingWindowISO({
  campaignStartISO: "2026-10-01",
  campaignEndISO: "2026-10-31",
  asAtISO: "2026-10-10",
})

const bursts = [
  { startDate: "2026-10-01", endDate: "2026-10-31", budget: 3100, deliverables: 310000 },
]

function pace(
  days: Array<{ impressions: number; clicks: number }>,
  wholeDelivery?: { impressions: number; clicks: number },
  w = window,
) {
  return computeLinePace({
    rawBursts: bursts,
    daily: days.map((d, i) => ({
      date: `2026-10-0${i + 1}`,
      spend: 10,
      deliverable: d.impressions,
      impressions: d.impressions,
      clicks: d.clicks,
    })),
    window: w,
    toDate: window,
    deliverableIsImpressions: true,
    wholeDelivery,
  })
}

test("clicks and no impressions: not tracked, nothing expected, line says No impression tracking", () => {
  const p = pace([{ impressions: 0, clicks: 5 }, { impressions: 0, clicks: 3 }])
  assert.equal(p.deliverables.tracked, false)
  assert.equal(p.deliverables.expected, 0)
  assert.equal(untrackedLineNote(p), NO_IMPRESSION_TRACKING)
  assert.equal(NO_IMPRESSION_TRACKING, "No impression tracking")
})

test("a line with impressions is tracked and has no note", () => {
  const p = pace([{ impressions: 1000, clicks: 5 }])
  assert.equal(p.deliverables.tracked, true)
  assert.ok(p.deliverables.expected > 0)
  assert.equal(untrackedLineNote(p), null)
})

test("card note counts the lines with no impression tracking", () => {
  const off = pace([{ impressions: 0, clicks: 2 }])
  const on = pace([{ impressions: 500, clicks: 2 }])
  assert.equal(untrackedNote([on]), null)
  assert.equal(untrackedNote([off, on]), "No impression tracking on 1 line")
  assert.equal(untrackedNote([off, off, on]), "No impression tracking on 2 lines")
})

const lateWindow = resolvePacingWindowISO({
  filterStartISO: "2026-10-02",
  filterEndISO: "2026-10-09",
  campaignStartISO: "2026-10-01",
  campaignEndISO: "2026-10-31",
  asAtISO: "2026-10-10",
})

test("the whole delivery decides, not the selected dates (REP-5)", () => {
  // Impressions ran early in the month; the selected dates hold only clicks.
  const days = [
    { impressions: 900, clicks: 4 },
    { impressions: 0, clicks: 2 },
    { impressions: 0, clicks: 3 },
  ]
  const tracked = pace(days, { impressions: 900, clicks: 9 }, lateWindow)
  assert.equal(tracked.deliverables.tracked, true)
  assert.equal(untrackedLineNote(tracked), null)
  // A true click tracker: clicks and no impressions across the whole delivery.
  const tracker = pace([{ impressions: 0, clicks: 4 }], { impressions: 0, clicks: 4 }, lateWindow)
  assert.equal(tracker.deliverables.tracked, false)
  assert.equal(tracker.deliverables.expected, 0)
  assert.equal(tracker.deliverables.expectedToDate, 0)
})

test("untracked lines stay out of the channel's planned impressions and CPM", () => {
  const on = pace([{ impressions: 500, clicks: 2 }], { impressions: 500, clicks: 2 })
  const off = pace([{ impressions: 0, clicks: 2 }], { impressions: 0, clicks: 2 })
  assert.equal(on.deliverables.planned, 310000)
  assert.equal(off.deliverables.planned, 310000)
  const channel = sumLinePaces([on, off])
  assert.equal(channel.deliverables.planned, 310000)
  assert.equal(channel.deliverables.tracked, false)
  assert.equal(countsTowardsCpm(on), true)
  assert.equal(countsTowardsCpm(off), false)
  // Every line untracked: the card keeps the full plan, like Direct Booked Digital.
  assert.equal(sumLinePaces([off, off]).deliverables.planned, 620000)
  // Every line tracked: unchanged.
  assert.equal(sumLinePaces([on, on]).deliverables.planned, 620000)
})
