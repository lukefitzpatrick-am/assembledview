/**
 * Programmatic and social line pace: a line with clicks and no impressions
 * reads "No impression tracking", the same label as Direct Booked Digital
 * (REP-5; Luke, 29 Oct 2026).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { NO_IMPRESSION_TRACKING, resolvePacingWindowISO } from "@/lib/pacing/expectedForWindow"

import { computeLinePace, untrackedLineNote, untrackedNote } from "../linePace"

const window = resolvePacingWindowISO({
  campaignStartISO: "2026-10-01",
  campaignEndISO: "2026-10-31",
  asAtISO: "2026-10-10",
})

const bursts = [
  { startDate: "2026-10-01", endDate: "2026-10-31", budget: 3100, deliverables: 310000 },
]

function pace(days: Array<{ impressions: number; clicks: number }>) {
  return computeLinePace({
    rawBursts: bursts,
    daily: days.map((d, i) => ({
      date: `2026-10-0${i + 1}`,
      spend: 10,
      deliverable: d.impressions,
      impressions: d.impressions,
      clicks: d.clicks,
    })),
    window,
    toDate: window,
    deliverableIsImpressions: true,
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
