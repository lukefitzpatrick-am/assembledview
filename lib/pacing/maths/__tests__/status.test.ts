import assert from "node:assert/strict"
import test from "node:test"
import { computeStatus } from "../index.js"

function s(
  over: Partial<{
    asOfDate: string
    startDate: string
    endDate: string
    spendToDate: number
    daysPassed: number
    projectionVariancePct: number
  }> = {},
) {
  return computeStatus({
    asOfDate: "2026-05-15",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    spendToDate: 1000,
    daysPassed: 10,
    projectionVariancePct: 0,
    ...over,
  })
}

test("not_started", () => {
  assert.equal(s({ asOfDate: "2026-05-15", startDate: "2026-06-01" }), "not_started")
})

test("completed", () => {
  assert.equal(s({ asOfDate: "2026-05-15", endDate: "2025-12-31" }), "completed")
})

test("no_delivery when spend is zero and daysPassed >= 2", () => {
  assert.equal(s({ spendToDate: 0, daysPassed: 5 }), "no_delivery")
})

test("no_delivery boundary: daysPassed 1 does not trigger", () => {
  assert.notEqual(s({ spendToDate: 0, daysPassed: 1 }), "no_delivery")
})

test("on_track for small positive variance", () => {
  assert.equal(s({ projectionVariancePct: 0.03 }), "on_track")
})

test("on_track boundary: exactly 0.05", () => {
  assert.equal(s({ projectionVariancePct: 0.05 }), "on_track")
})

test("on_track boundary: exactly -0.05", () => {
  assert.equal(s({ projectionVariancePct: -0.05 }), "on_track")
})

test("slightly_under", () => {
  assert.equal(s({ projectionVariancePct: -0.08 }), "slightly_under")
})

test("under_pacing", () => {
  assert.equal(s({ projectionVariancePct: -0.2 }), "under_pacing")
})

test("under_pacing boundary: exactly -0.15", () => {
  assert.equal(s({ projectionVariancePct: -0.15 }), "under_pacing")
})

test("slightly_over", () => {
  assert.equal(s({ projectionVariancePct: 0.1 }), "slightly_over")
})

test("over_pacing", () => {
  assert.equal(s({ projectionVariancePct: 0.2 }), "over_pacing")
})

test("over_pacing boundary: exactly 0.15", () => {
  assert.equal(s({ projectionVariancePct: 0.15 }), "over_pacing")
})

test("not_started wins over spend-based states (early spend)", () => {
  assert.equal(
    computeStatus({
      asOfDate: "2026-05-01",
      startDate: "2026-06-01",
      endDate: "2026-12-31",
      spendToDate: 50_000,
      daysPassed: 0,
      projectionVariancePct: 0.5,
    }),
    "not_started",
  )
})

test("unknown when no branch matches (e.g. variance in a gap)", () => {
  assert.equal(s({ projectionVariancePct: Number.NaN }), "unknown")
})
