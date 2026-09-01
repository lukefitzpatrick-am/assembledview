import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { xeroSyncFreshnessFromNewest } from "@/lib/ops/health/checks"

const NOW = new Date("2026-09-01T12:00:00.000Z")

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString()
}

describe("Xero sync freshness", () => {
  it("returns green when the newest run is 2h old", () => {
    const r = xeroSyncFreshnessFromNewest(
      { run_started_at: hoursAgo(2), status: "success" },
      NOW,
    )
    assert.equal(r.name, "Xero sync freshness")
    assert.equal(r.status, "green")
    assert.match(r.detail, /status=success/)
    assert.match(r.detail, /age=2h/)
  })

  it("returns amber when the newest run is 3d old", () => {
    const r = xeroSyncFreshnessFromNewest(
      { run_started_at: hoursAgo(3 * 24), status: "partial_error" },
      NOW,
    )
    assert.equal(r.status, "amber")
    assert.match(r.detail, /status=partial_error/)
    assert.match(r.detail, /age=72h/)
  })

  it("returns red when the newest run is 30d old", () => {
    const r = xeroSyncFreshnessFromNewest(
      { run_started_at: hoursAgo(30 * 24), status: "failed" },
      NOW,
    )
    assert.equal(r.status, "red")
    assert.match(r.detail, /status=failed/)
    assert.match(r.detail, /age=720h/)
  })

  it("returns red when the table is empty", () => {
    const r = xeroSyncFreshnessFromNewest(null, NOW)
    assert.equal(r.status, "red")
    assert.match(r.detail, /empty/i)
  })

  it("returns red with a distinct detail when the timestamp is unparseable", () => {
    const r = xeroSyncFreshnessFromNewest(
      { run_started_at: "not-a-date", status: "success" },
      NOW,
    )
    assert.equal(r.status, "red")
    assert.equal(r.detail, "unparseable timestamp")
  })
})
