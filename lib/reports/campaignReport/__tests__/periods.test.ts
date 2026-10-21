import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  capWindowAtMelbourneYesterday,
  clipWindowToCampaign,
  resolveCampaignReportPeriod,
} from "@/lib/reports/campaignReport/periods"

describe("resolveCampaignReportPeriod", () => {
  it("defaults this month from Melbourne today", () => {
    const r = resolveCampaignReportPeriod({
      kind: "this_month",
      todayISO: "2026-08-15",
    })
    assert.equal(r.slug, "this-month")
    assert.equal(r.current.startISO, "2026-08-01")
    assert.equal(r.current.endISO, "2026-08-15")
    assert.equal(r.previous?.startISO, "2026-07-01")
    assert.equal(r.previous?.endISO, "2026-07-31")
  })

  it("resolves last month and prior comparison month", () => {
    const r = resolveCampaignReportPeriod({
      kind: "last_month",
      todayISO: "2026-08-02",
    })
    assert.equal(r.slug, "last-month")
    assert.equal(r.current.startISO, "2026-07-01")
    assert.equal(r.current.endISO, "2026-07-31")
    assert.equal(r.previous?.startISO, "2026-06-01")
    assert.equal(r.previous?.endISO, "2026-06-30")
  })

  it("campaign to date has no previous window", () => {
    const r = resolveCampaignReportPeriod({
      kind: "campaign_to_date",
      campaignStartISO: "2026-06-01",
      campaignEndISO: "2026-12-31",
      todayISO: "2026-08-10",
    })
    assert.equal(r.slug, "campaign-to-date")
    assert.equal(r.current.startISO, "2026-06-01")
    assert.equal(r.current.endISO, "2026-08-10")
    assert.equal(r.previous, null)
  })

  it("requires custom bounds", () => {
    assert.throws(() =>
      resolveCampaignReportPeriod({
        kind: "custom",
        todayISO: "2026-08-02",
      }),
    )
    const r = resolveCampaignReportPeriod({
      kind: "custom",
      customStartISO: "2026-07-01",
      customEndISO: "2026-07-15",
      todayISO: "2026-08-02",
    })
    assert.equal(r.slug, "custom")
    assert.equal(r.current.startISO, "2026-07-01")
    assert.equal(r.current.endISO, "2026-07-15")
  })
})

describe("clipWindowToCampaign", () => {
  it("clips to flight bounds", () => {
    const clipped = clipWindowToCampaign(
      { startISO: "2026-01-01", endISO: "2026-12-31" },
      "2026-03-01",
      "2026-06-30",
    )
    assert.deepEqual(clipped, { startISO: "2026-03-01", endISO: "2026-06-30" })
  })
})

describe("capWindowAtMelbourneYesterday", () => {
  it("stops a window that runs to today at yesterday", () => {
    assert.deepEqual(
      capWindowAtMelbourneYesterday({ startISO: "2026-07-01", endISO: "2026-10-21" }, "2026-10-21"),
      { startISO: "2026-07-01", endISO: "2026-10-20" },
    )
  })
  it("leaves a window that already ended before today", () => {
    const w = { startISO: "2026-09-01", endISO: "2026-09-30" }
    assert.deepEqual(capWindowAtMelbourneYesterday(w, "2026-10-21"), w)
  })
  it("leaves a window that starts today, so day one still has a window", () => {
    const w = { startISO: "2026-10-21", endISO: "2026-10-21" }
    assert.deepEqual(capWindowAtMelbourneYesterday(w, "2026-10-21"), w)
  })
  it("caps this month on the 2nd to the 1st", () => {
    const period = resolveCampaignReportPeriod({ kind: "this_month", todayISO: "2026-08-02" })
    assert.deepEqual(capWindowAtMelbourneYesterday(period.current, "2026-08-02"), {
      startISO: "2026-08-01",
      endISO: "2026-08-01",
    })
  })
})
