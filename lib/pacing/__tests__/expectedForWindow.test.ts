import assert from "node:assert/strict"
import test from "node:test"

import {
  burstSpendGoals,
  expectedForWindow,
  impressionsNotTracked,
  inPacingWindow,
  netSpendBasisForLine,
  pacingAsAtISO,
  paceVsExpected,
  plannedTotal,
  resolvePacingWindow,
  resolvePacingWindowISO,
  sumInWindow,
  windowPhrase,
} from "../expectedForWindow.js"

// golf025 News Corp CM360 lines (published version 19590). Burst instants are
// Sydney midnights: 2026-10-01T14:00Z is 2 Oct, 2026-12-02T13:00Z is 3 Dec.
const DD3 = [
  { budget: "9947", buyAmount: "$17.15", calculatedValue: 580000, startDate: "2026-10-01T14:00:00.000Z", endDate: "2026-12-02T13:00:00.000Z" },
]
const DD4 = [
  { budget: "10198.18", buyAmount: "$17.15", calculatedValue: 594646, startDate: "2026-10-01T14:00:00.000Z", endDate: "2026-12-02T13:00:00.000Z" },
]
/** Starts 1 Nov: nothing expected before then. */
const DD7 = [
  { budget: "15523.55", buyAmount: "$21.83", calculatedValue: 711111, startDate: "2026-10-31T13:00:00.000Z", endDate: "2026-12-02T13:00:00.000Z" },
]

const close = (actual: number, expected: number, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} !== ${expected}`)

test("pacingAsAtISO is Melbourne yesterday, capped at the campaign end", () => {
  // 00:30 on 20 Oct in Melbourne (AEDT) is still 19 Oct in UTC.
  const ref = new Date("2026-10-19T13:30:00Z")
  assert.equal(pacingAsAtISO("2026-12-31", ref), "2026-10-19")
  assert.equal(pacingAsAtISO("2026-10-10", ref), "2026-10-10")
  // 23:30 on 19 Oct in Melbourne: yesterday is 18 Oct.
  assert.equal(pacingAsAtISO("2026-12-31", new Date("2026-10-19T12:30:00Z")), "2026-10-18")
})

test("no filter: campaign start to as at", () => {
  const w = resolvePacingWindow({ campaignStartISO: "2026-08-25", campaignEndISO: "2026-12-03", asAtISO: "2026-10-19" })
  assert.deepEqual(w, { startISO: "2026-08-25", endISO: "2026-10-19", filtered: false, empty: false })
  assert.equal(windowPhrase(w), "to date")
})

test("a filter running past yesterday stops at yesterday", () => {
  const w = resolvePacingWindow({
    filterRange: { start: new Date(2026, 9, 10), end: new Date(2026, 9, 31) },
    campaignStartISO: "2026-08-25",
    campaignEndISO: "2026-12-03",
    asAtISO: "2026-10-19",
  })
  assert.deepEqual(w, { startISO: "2026-10-10", endISO: "2026-10-19", filtered: true, empty: false })
  assert.equal(windowPhrase(w), "in period")
})

test("a filter wholly in the future is empty", () => {
  const w = resolvePacingWindow({
    filterRange: { start: new Date(2026, 10, 1), end: new Date(2026, 10, 30) },
    campaignStartISO: "2026-08-25",
    campaignEndISO: "2026-12-03",
    asAtISO: "2026-10-19",
  })
  assert.equal(w.empty, true)
  assert.equal(expectedForWindow(DD3, "deliverables", w), 0)
})

test("a filter equal to the whole campaign is not 'in period'", () => {
  const w = resolvePacingWindow({
    filterRange: { start: new Date(2026, 7, 25), end: new Date(2026, 11, 3) },
    campaignStartISO: "2026-08-25",
    campaignEndISO: "2026-12-03",
    asAtISO: "2026-10-19",
  })
  assert.equal(w.filtered, false)
  assert.equal(w.endISO, "2026-10-19")
})

test("golf025 DD3 impressions expected to 19 Oct: 18 of 63 Sydney days", () => {
  const w = resolvePacingWindow({ campaignStartISO: "2026-08-25", campaignEndISO: "2026-12-03", asAtISO: "2026-10-19" })
  close(expectedForWindow(DD3, "deliverables", w), (580000 * 18) / 63)
  close(plannedTotal(DD3, "deliverables"), 580000)
})

test("a future-starting line expects nothing yet", () => {
  const w = resolvePacingWindow({ campaignStartISO: "2026-08-25", campaignEndISO: "2026-12-03", asAtISO: "2026-10-19" })
  assert.equal(expectedForWindow(DD7, "deliverables", w), 0)
  assert.equal(expectedForWindow(DD7, "spend", w), 0)
})

test("golf025 News Corp: click trackers drop out of expected impressions", () => {
  const w = resolvePacingWindow({ campaignStartISO: "2026-08-25", campaignEndISO: "2026-12-03", asAtISO: "2026-10-19" })
  assert.equal(impressionsNotTracked({ impressions: 0, clicks: 136 }), true)
  assert.equal(impressionsNotTracked({ impressions: 262025, clicks: 868 }), false)
  assert.equal(impressionsNotTracked({ impressions: 0, clicks: 0 }), false)
  const expected = expectedForWindow(DD3, "deliverables", w) + expectedForWindow(DD4, "deliverables", w)
  close(expected, ((580000 + 594646) * 18) / 63)
  const pace = paceVsExpected(262025 + 110698, expected)
  assert.equal(pace.status, "ahead")
  close(pace.pct!, ((262025 + 110698) / expected) * 100)
  assert.equal(pace.progress, 1)
})

test("filtered window: expected is the slice inside the window", () => {
  const w = resolvePacingWindow({
    filterRange: { start: new Date(2026, 9, 10), end: new Date(2026, 9, 31) },
    campaignStartISO: "2026-08-25",
    campaignEndISO: "2026-12-03",
    asAtISO: "2026-10-19",
  })
  close(expectedForWindow(DD3, "spend", w), (9947 * 10) / 63)
})

test("fee-inclusive spend goal is media only", () => {
  // TheY001SM1-style: $8,800 gross at a 15% social fee.
  const bursts = [{ budget: "$8,800.00", calculatedValue: 2200000, startDate: "2026-10-10T13:00:00.000Z", endDate: "2026-10-30T13:00:00.000Z" }]
  // Fee snapshot only.
  close(plannedTotal(bursts, "spend", { budgetIncludesFees: true, feePct: 15 }), 7480)
  // Stored line net total wins over the fee snapshot.
  close(plannedTotal(bursts, "spend", { budgetIncludesFees: true, feePct: 0, lineTotalMedia: 7480 }), 7480)
  // A burst media amount wins over both.
  const withMedia = [{ ...bursts[0], mediaAmount: "$7,000.00" }]
  close(plannedTotal(withMedia, "spend", { budgetIncludesFees: true, feePct: 15, lineTotalMedia: 7480 }), 7000)
  // Not fee-inclusive: the budget stands.
  close(plannedTotal(bursts, "spend", { budgetIncludesFees: false, feePct: 15 }), 8800)
  close(plannedTotal(bursts, "spend"), 8800)
  // Deliverables are never netted.
  close(plannedTotal(bursts, "deliverables", { budgetIncludesFees: true, feePct: 15 }), 2200000)
  // 11 Oct to 31 Oct (Sydney) is 21 days; to 19 Oct is 9.
  const w = resolvePacingWindow({ campaignStartISO: "2026-10-11", campaignEndISO: "2026-10-31", asAtISO: "2026-10-19" })
  close(expectedForWindow(bursts, "spend", w, { budgetIncludesFees: true, feePct: 15 }), (7480 * 9) / 21)
})

test("line net total spreads over bursts by budget", () => {
  const bursts = [
    { budget: "$600.00", startDate: "2026-10-01", endDate: "2026-10-10" },
    { budget: "$400.00", startDate: "2026-10-11", endDate: "2026-10-20" },
  ]
  const goals = burstSpendGoals(bursts, { budgetIncludesFees: true, lineTotalMedia: 900 })
  close(goals[0]!, 540)
  close(goals[1]!, 360)
})

test("sumInWindow and inPacingWindow use string days", () => {
  const w = resolvePacingWindow({ campaignStartISO: "2026-10-01", campaignEndISO: "2026-10-31", asAtISO: "2026-10-19" })
  const rows = [
    { date: "2026-09-30", v: 100 },
    { date: "2026-10-01", v: 1 },
    { date: "2026-10-19", v: 2 },
    { date: "2026-10-20", v: 50 },
  ]
  assert.equal(sumInWindow(rows, w, (r) => r.v), 3)
  assert.equal(inPacingWindow("2026-10-20", w), false)
})

test("paceVsExpected: nothing expected is no data, not behind", () => {
  assert.deepEqual(paceVsExpected(0, 0), { pct: undefined, status: "no-data", variance: 0, progress: 0 })
  assert.equal(paceVsExpected(10, 0).progress, 1)
  const behind = paceVsExpected(80, 100)
  assert.equal(behind.status, "behind")
  close(behind.variance, -0.2)
  close(behind.progress, 0.8)
  assert.equal(paceVsExpected(100, 100).status, "on-track")
})

test("netSpendBasisForLine reads the line flag, fee snapshot and stored net total", () => {
  const fees = { "17014": { socialMedia: 15 } } as never
  assert.deepEqual(netSpendBasisForLine({ budget_includes_fees: false, totalMedia: 10 }, { mediaType: "socialMedia", feePctsByVersionId: fees }), {
    budgetIncludesFees: false,
  })
  assert.deepEqual(
    netSpendBasisForLine({ budget_includes_fees: true, media_plan_version: 17014, totalMedia: 33830 }, { mediaType: "socialMedia", feePctsByVersionId: fees }),
    { budgetIncludesFees: true, feePct: 15, lineTotalMedia: 33830 },
  )
  // No snapshot row for the version: fee unknown.
  assert.deepEqual(
    netSpendBasisForLine({ budget_includes_fees: true, media_plan_version: 1 }, { mediaType: "socialMedia", feePctsByVersionId: fees }),
    { budgetIncludesFees: true, feePct: null, lineTotalMedia: null },
  )
  // Falls back to the page's version id.
  assert.equal(
    netSpendBasisForLine({ budget_includes_fees: true }, { mediaType: "socialMedia", feePctsByVersionId: fees, fallbackVersionId: 17014 }).feePct,
    15,
  )
})

test("resolvePacingWindowISO matches resolvePacingWindow for URL date strings", () => {
  const ref = new Date("2026-10-19T22:00:00Z") // 09:00 20 Oct Melbourne
  const plain = resolvePacingWindowISO({
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-12-31",
    reference: ref,
  })
  assert.deepEqual(plain, { startISO: "2026-10-01", endISO: "2026-10-19", filtered: false, empty: false })

  const filtered = resolvePacingWindowISO({
    filterStartISO: "2026-10-05",
    filterEndISO: "2026-11-30",
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-12-31",
    reference: ref,
  })
  assert.deepEqual(filtered, { startISO: "2026-10-05", endISO: "2026-10-19", filtered: true, empty: false })
  const viaDates = resolvePacingWindow({
    filterRange: { start: new Date(2026, 9, 5), end: new Date(2026, 10, 30) },
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-12-31",
    asAtISO: "2026-10-19",
  })
  assert.deepEqual(viaDates, filtered)

  // One end missing: no filter. A reversed filter reads in order.
  assert.equal(
    resolvePacingWindowISO({ filterStartISO: "2026-10-05", campaignStartISO: "2026-10-01", campaignEndISO: "2026-12-31", reference: ref }).filtered,
    false,
  )
  assert.deepEqual(
    resolvePacingWindowISO({
      filterStartISO: "2026-10-10",
      filterEndISO: "2026-10-05",
      campaignStartISO: "2026-10-01",
      campaignEndISO: "2026-12-31",
      reference: ref,
    }),
    { startISO: "2026-10-05", endISO: "2026-10-10", filtered: true, empty: false },
  )
  // A future-only filter has nothing expected.
  assert.equal(
    resolvePacingWindowISO({
      filterStartISO: "2026-11-01",
      filterEndISO: "2026-11-30",
      campaignStartISO: "2026-10-01",
      campaignEndISO: "2026-12-31",
      reference: ref,
    }).empty,
    true,
  )
})
