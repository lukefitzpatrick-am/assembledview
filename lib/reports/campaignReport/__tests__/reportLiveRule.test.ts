/**
 * REP-1 deck "not live" rule (Luke 28 Oct 2026, option c).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { assumedLinesStartedBy, channelReportPace } from "../reportPace.js"

test("CM360 programmatic lines with modelled spend are live and flagged estimated", () => {
  const pace = channelReportPace({
    spend: 1600,
    plannedBudget: 28_000,
    lines: [
      { lineItemId: "sinch001pd1", spendToDate: 1050, spendMode: "estimated", expectedNetToDate: 1200 },
      { lineItemId: "sinch001pv1", spendToDate: 550, spendMode: "estimated", expectedNetToDate: 600 },
    ],
  })
  assert.equal(pace.notLive, false)
  assert.equal(pace.spendEstimated, true)
  assert.equal(pace.spendAssumed, false)
})

test("a channel with $0 and no started assumed line stays not live", () => {
  const pace = channelReportPace({
    spend: 0,
    plannedBudget: 5000,
    lines: [{ lineItemId: "x1", spendToDate: 0, startDate: "2026-11-01" }],
  })
  assert.equal(pace.notLive, true)
  assert.equal(pace.plannedStart, "2026-11-01")
})

test("an assumed-spend line whose flight has started is live and flagged assumed", () => {
  const started = assumedLinesStartedBy(
    [
      { id: "golf025ra1", bursts: [{ startDate: "2026-10-01" }] },
      { id: "golf025ra2", bursts: [{ startDate: "2026-11-01" }] },
    ],
    "2026-10-27",
  )
  assert.deepEqual([...started], ["golf025ra1"])
  const live = channelReportPace({
    spend: 0,
    plannedBudget: 5000,
    lines: [{ lineItemId: "golf025ra1", spendToDate: 0, spendMode: "assumed" }],
    startedAssumedIds: started,
  })
  assert.equal(live.notLive, false)
  assert.equal(live.spendAssumed, true)
  const notYet = channelReportPace({
    spend: 0,
    plannedBudget: 5000,
    lines: [{ lineItemId: "golf025ra2", spendToDate: 0, spendMode: "assumed" }],
    startedAssumedIds: started,
  })
  assert.equal(notYet.notLive, true)
  assert.equal(notYet.spendAssumed, false)
})

test("assumed spend above $0 keeps today's behaviour", () => {
  const pace = channelReportPace({
    spend: 400,
    plannedBudget: 5000,
    lines: [{ spendToDate: 400, spendMode: "assumed" }],
  })
  assert.equal(pace.notLive, false)
  assert.equal(pace.spendAssumed, true)
})

test("assumedLinesStartedBy: no lines or no day is an empty set", () => {
  assert.equal(assumedLinesStartedBy(undefined, "2026-10-27").size, 0)
  assert.equal(assumedLinesStartedBy([{ id: "a", bursts: [{ startDate: "2026-10-01" }] }], null).size, 0)
})
