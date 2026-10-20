/**
 * The delivery compute runs in the browser. In Australia, local midnight is the
 * previous day in UTC, so any `toISOString` day key moves back one day. These
 * tests run the real compute in Australia/Melbourne time and check every day
 * lands on its true date and nothing is lost at either end.
 */
process.env.TZ = "Australia/Melbourne"

import assert from "node:assert/strict"
import { test } from "node:test"

type Range = { start: Date | null; end: Date | null }

async function load() {
  const social = await import("@/lib/delivery/social/socialChannelCompute")
  const prog = await import("@/lib/delivery/programmatic/programmaticCompute")
  const meta = await import("@/lib/pacing/social/metaPacing")
  const filter = await import("@/lib/dashboard/dateFilter")
  return { social, prog, meta, filter }
}

function days(start: string, end: string): string[] {
  const out: string[] = []
  let d = new Date(`${start}T00:00:00Z`)
  const e = new Date(`${end}T00:00:00Z`)
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86_400_000)
  }
  return out
}

async function run(opts: {
  cs: string
  ce: string
  asAt: string
  filter?: { start: string; end: string }
  burst?: { start_date: string; end_date: string }
}) {
  const { social, prog, filter } = await load()
  const fr: Range = opts.filter
    ? { start: filter.parseDateOnly(opts.filter.start), end: filter.parseDateOnly(opts.filter.end) }
    : { start: null, end: null }
  const ds = days(opts.cs, opts.ce)
  const burst = opts.burst ?? { start_date: opts.cs, end_date: opts.ce }
  const bursts = [{ ...burst, budget_number: 10 * ds.length, calculated_value_number: 1000 * ds.length }]
  const item = { line_item_id: "test001pd1", platform: "meta", buy_type: "cpm", bursts }
  const pacingWindow = { campaignStartISO: opts.cs, campaignEndISO: opts.ce, asAtISO: opts.asAt }

  const socialRows = ds.map((d) => ({
    dateDay: d, adsetName: "a", lineItemId: "test001pd1", channel: "meta",
    amountSpent: 10, impressions: 1000, clicks: 1, results: 1, video3sViews: 0,
  }))
  const sm = social.computeSocialLineMetricsForPlatform({
    activeItems: [item], socialRows, campaignStart: opts.cs, campaignEnd: opts.ce, mbaNumber: "X",
    kpiTargets: undefined, filterRange: fr, pacingWindow,
  } as never)
  const sa = social.buildSocialAggregatePacing(sm, opts.asAt, opts.cs, opts.ce, fr as never)

  const progRows = ds.map((d) => ({
    date: d, lineItem: "a", insertionOrder: null, spend: 10, impressions: 1000, clicks: 1,
    conversions: 1, videoViews: 0, matchedPostfix: "test001pd1",
  }))
  const norm = prog.normalizeProgrammaticLineItems([{ ...item, platform: "dv360" }] as never)
  const range = prog.buildProgrammaticCampaignDateRange(opts.cs, opts.ce)
  const pm = prog.buildProgrammaticLineItemMetrics(
    norm, progRows as never, range, opts.asAt, "progdisplay", undefined,
    { startISO: opts.cs, endISO: opts.ce }, opts.cs, opts.ce, fr as never,
  )
  const pa = prog.buildProgrammaticAggregatedMetrics(pm, opts.asAt, opts.cs, opts.ce, fr as never)
  return { s: sm[0], sa, p: pm[0], pa, range }
}

test("runs in Melbourne time", () => {
  assert.notEqual(new Date(2026, 9, 20).getTimezoneOffset(), 0)
})

test("finished campaign: every day counted, charts on true dates", async () => {
  const { s, sa, p, pa, range } = await run({ cs: "2026-10-01", ce: "2026-10-10", asAt: "2026-10-10" })
  assert.deepEqual([range[0], range.at(-1)], ["2026-10-01", "2026-10-10"])
  for (const m of [s.pacing, sa, p.pacing, pa]) {
    assert.equal(m.spend.actualToDate, 100)
    assert.equal(m.spend.expectedToDate, 100)
  }
  assert.deepEqual([s.actualsDaily[0].date, s.actualsDaily.at(-1)?.date], ["2026-10-01", "2026-10-10"])
  assert.deepEqual([p.actualsDaily[0].date, p.actualsDaily.at(-1)?.date], ["2026-10-01", "2026-10-10"])
  assert.equal(p.actualsDaily.reduce((sum, d) => sum + d.spend, 0), 100)
})

test("mid-flight: actual and expected cover the same days", async () => {
  const { s, p } = await run({ cs: "2026-10-01", ce: "2026-10-10", asAt: "2026-10-05" })
  assert.equal(s.pacing.spend.actualToDate, 50)
  assert.equal(s.pacing.spend.expectedToDate, 50)
  assert.equal(p.pacing.spend.actualToDate, 50)
  assert.equal(p.pacing.spend.expectedToDate, 50)
})

test("date filter: line and channel totals match the filtered days", async () => {
  const { s, sa, p, pa } = await run({
    cs: "2026-10-01", ce: "2026-10-10", asAt: "2026-10-10", filter: { start: "2026-10-03", end: "2026-10-05" },
  })
  for (const m of [s.pacing, sa, p.pacing, pa]) {
    assert.equal(m.spend.actualToDate, 30)
    assert.equal(m.spend.expectedToDate, 30)
  }
  assert.deepEqual(s.actualsDaily.map((d) => d.date), ["2026-10-03", "2026-10-04", "2026-10-05"])
})

test("burst over the April daylight saving change is 10 days, not 11", async () => {
  const { s } = await run({ cs: "2027-04-01", ce: "2027-04-10", asAt: "2027-04-05" })
  assert.equal(s.pacing.spend.expectedToDate, 50)
})

test("plan bursts saved as Sydney-midnight instants land on the right days", async () => {
  const { s, p } = await run({
    cs: "2026-10-01", ce: "2026-10-10", asAt: "2026-10-10",
    burst: { start_date: "2026-09-30T14:00:00.000Z", end_date: "2026-10-09T13:00:00.000Z" },
  })
  assert.deepEqual([s.window.startISO, s.window.endISO], ["2026-10-01", "2026-10-10"])
  assert.equal(s.pacing.spend.expectedToDate, 100)
  assert.equal(p.pacing.spend.expectedToDate, 100)
})

test("Meta day keys are the true dates", async () => {
  const { meta } = await load()
  const out = meta.summariseDelivery(
    [{ dateDay: "2026-10-01", adsetName: "a", amountSpent: 5 }, { dateDay: "2026-10-10", adsetName: "a", amountSpent: 7 }],
    "2026-10-01", "2026-10-10", new Date("2026-10-10T00:00:00Z"),
  )
  assert.deepEqual(out.daily.map((d) => d.dateDay), ["2026-10-01", "2026-10-10"])
  assert.equal(out.amountSpentToDate, 12)
})
