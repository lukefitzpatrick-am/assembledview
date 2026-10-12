import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  channelReportPace,
  netBurstExpectedInWindow,
  reportGapReason,
  reportPace,
} from "@/lib/reports/campaignReport/reportPace"

type FixtureChannel = {
  group: string
  spend: number
  plannedBudget: number
  metrics: { spendPacePct: number | null }
}

type Fixture = {
  period: { current: { startISO: string; endISO: string } }
  totals: {
    spend: number
    plannedBudget: number
    expectedSpendToDate: number
    timeElapsedPct: number
    metrics: { spendPacePct: number | null }
  }
  channels: FixtureChannel[]
}

function loadFixture(name: string): Fixture {
  const file = path.join(
    process.cwd(),
    "docs/superpowers/overnight-av-fixes/discovery",
    name,
  )
  return JSON.parse(readFileSync(file, "utf8")) as Fixture
}

const fixtures = [
  loadFixture("AV-TP10-curatif004-2026-09.json"),
  loadFixture("AV-TP10-hema007-2026-09.json"),
]

test("curatif004 and hema007 channel spend sums to campaign spend", () => {
  for (const fixture of fixtures) {
    const sum = fixture.channels.reduce((total, channel) => total + channel.spend, 0)
    assert.ok(
      Math.abs(sum - fixture.totals.spend) < 0.02,
      `channel spend ${sum} vs campaign spend ${fixture.totals.spend}`,
    )
  }
})

test("campaign pace is spend divided by the delivery-schedule expected", () => {
  for (const fixture of fixtures) {
    const pace = reportPace(fixture.totals.spend, fixture.totals.expectedSpendToDate, true)
    assert.ok(pace.spendPacePct != null)
    assert.ok(Math.abs(pace.spendPacePct - fixture.totals.spend / fixture.totals.expectedSpendToDate) < 1e-9)
    assert.ok(Math.abs(pace.spendPacePct - (fixture.totals.metrics.spendPacePct ?? NaN)) < 1e-9)
    assert.equal(pace.paceBand, "Behind")
    assert.equal(pace.paceReason, null)
  }
})

test("channel pace uses net burst expected in the window, not flight elapsed", () => {
  for (const fixture of fixtures) {
    for (const channel of fixture.channels) {
      if (!(channel.spend > 0) || !(channel.plannedBudget > 0)) continue
      const elapsedExpected = channel.plannedBudget * fixture.totals.timeElapsedPct
      const elapsedPace = channel.spend / elapsedExpected
      assert.ok(
        Math.abs(elapsedPace - (channel.metrics.spendPacePct ?? NaN)) < 1e-6,
        `${channel.group} fixture pace is the elapsed basis`,
      )

      const scheduleExpected = netBurstExpectedInWindow({
        bursts: [
          {
            startDate: fixture.period.current.startISO,
            endDate: fixture.period.current.endISO,
            budget: channel.plannedBudget,
            mediaAmount: channel.plannedBudget * 0.4,
          },
        ],
        budgetIncludesFees: false,
        feePct: 0,
        lineBudget: channel.plannedBudget,
        lineStart: fixture.period.current.startISO,
        lineEnd: fixture.period.current.endISO,
        lineItemId: channel.group,
        windowStart: fixture.period.current.startISO,
        windowEnd: fixture.period.current.endISO,
        asOf: fixture.period.current.endISO,
      })
      const pace = channelReportPace({
        spend: channel.spend,
        plannedBudget: channel.plannedBudget,
        lines: [
          {
            spendToDate: channel.spend,
            startDate: fixture.period.current.startISO,
            spendMode: "actual",
            expectedNetToDate: scheduleExpected,
          },
        ],
      })
      assert.ok(Math.abs(scheduleExpected - elapsedExpected) > 1)
      assert.equal(pace.expectedSpendToDate, scheduleExpected)
      assert.ok(pace.spendPacePct != null)
      assert.equal(pace.spendPacePct, channel.spend / scheduleExpected)
      assert.ok(Math.abs(pace.spendPacePct - elapsedPace) > 0.01)
      assert.equal(pace.notLive, false)
    }
  }
})

test("client decks label 115% and above as Ahead", () => {
  assert.equal(reportPace(100, 100, true).paceBand, "On track")
  assert.equal(reportPace(89, 100, true).paceBand, "Behind")
  assert.equal(reportPace(114, 100, true).paceBand, "Ahead")
  assert.equal(reportPace(115, 100, true).paceBand, "Ahead")
  assert.equal(reportPace(140, 100, true).paceBand, "Ahead")
})

test("assumed and estimated spend stay in the pace numerator and are flagged", () => {
  const pace = channelReportPace({
    spend: 500,
    plannedBudget: 2000,
    lines: [
      {
        spendToDate: 400,
        spendMode: "assumed",
        startDate: "2026-09-01",
        expectedNetToDate: 600,
      },
      {
        spendToDate: 100,
        spendMode: "estimated",
        startDate: "2026-09-03",
        expectedNetToDate: 400,
      },
    ],
  })
  assert.equal(pace.spendPacePct, 500 / 1000)
  assert.equal(pace.spendAssumed, true)
  assert.equal(pace.spendEstimated, true)
  assert.equal(pace.plannedStart, "2026-09-01")
  assert.equal(pace.notLive, false)
})

test("a channel with no spend in the period is not live and keeps its plan", () => {
  const hema = fixtures[1]!
  const search = hema.channels.find((channel) => channel.group === "search")
  assert.ok(search)
  assert.equal(search.spend, 0)
  const pace = channelReportPace({
    spend: search.spend,
    plannedBudget: search.plannedBudget,
    lines: [
      {
        spendToDate: 0,
        startDate: "2026-07-01",
        expectedNetToDate: 4000,
      },
    ],
  })
  assert.equal(pace.notLive, true)
  assert.equal(pace.plannedBudget, 28000)
  assert.equal(pace.plannedStart, "2026-07-01")
  assert.equal(pace.spendPacePct, 0)
  assert.equal(pace.paceBand, "Behind")
})

test("missing pace and plan figures are null with a reason code", () => {
  assert.equal(reportGapReason(null, "no_plan"), "no_plan")
  assert.equal(reportGapReason(null, "not_available"), "not_available")
  assert.equal(reportGapReason(0, "no_plan"), null)
  assert.equal(reportGapReason(12, "not_available"), null)

  const noPlan = reportPace(0, null, false)
  assert.equal(noPlan.spendPacePct, null)
  assert.equal(noPlan.paceBand, null)
  assert.equal(noPlan.paceReason, "no_plan")

  const notAvailable = reportPace(0, 0, true)
  assert.equal(notAvailable.spendPacePct, null)
  assert.equal(notAvailable.paceBand, null)
  assert.equal(notAvailable.paceReason, "not_available")
})
