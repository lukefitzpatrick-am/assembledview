import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  xeroStageConsecutiveFailures,
  xeroSyncFreshnessFromStages,
} from "@/lib/ops/health/checks"

const NOW = new Date("2026-09-01T12:00:00.000Z")

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString()
}

const fresh = {
  invoices: { stage: "invoices", run_started_at: hoursAgo(2) },
  import: { stage: "import", run_started_at: hoursAgo(2) },
  contacts: { stage: "contacts", run_started_at: hoursAgo(2) },
  pdfs: { stage: "pdfs", run_started_at: hoursAgo(2) },
}

describe("Xero sync freshness", () => {
  it("returns green when every stage succeeded within 36h", () => {
    const r = xeroSyncFreshnessFromStages(fresh, NOW)
    assert.equal(r.name, "Xero sync freshness")
    assert.equal(r.status, "green")
    assert.match(r.detail, /invoices=2h/)
  })

  it("returns red when one stage's newest success is older than 36h", () => {
    const r = xeroSyncFreshnessFromStages(
      { ...fresh, pdfs: { stage: "pdfs", run_started_at: hoursAgo(37) } },
      NOW,
    )
    assert.equal(r.status, "red")
    assert.match(r.detail, /pdfs=37h/)
  })

  it("returns red when a stage has no success row", () => {
    const r = xeroSyncFreshnessFromStages(
      { ...fresh, contacts: null },
      NOW,
    )
    assert.equal(r.status, "red")
    assert.match(r.detail, /contacts=none/)
  })
})

describe("Xero sync consecutive stage failures", () => {
  it("alerts when a stage failed or timed out on two consecutive runs", () => {
    const alerted = xeroStageConsecutiveFailures(
      [
        { id: 8, stage: "pdfs", status: "incomplete", run_started_at: hoursAgo(1) },
        { id: 7, stage: "pdfs", status: "failed", run_started_at: hoursAgo(25) },
        { id: 6, stage: "invoices", status: "failed", run_started_at: hoursAgo(1) },
        { id: 5, stage: "invoices", status: "success", run_started_at: hoursAgo(25) },
      ],
      NOW,
    )
    assert.deepEqual(alerted, ["pdfs"])
  })

  it("does not alert on a single failure", () => {
    const alerted = xeroStageConsecutiveFailures(
      [
        { id: 4, stage: "import", status: "failed", run_started_at: hoursAgo(1) },
        { id: 3, stage: "import", status: "success", run_started_at: hoursAgo(25) },
      ],
      NOW,
    )
    assert.deepEqual(alerted, [])
  })

  it("treats a running row older than 2h as a timeout", () => {
    const alerted = xeroStageConsecutiveFailures(
      [
        { id: 10, stage: "contacts", status: "running", run_started_at: hoursAgo(3) },
        { id: 9, stage: "contacts", status: "incomplete", run_started_at: hoursAgo(27) },
      ],
      NOW,
    )
    assert.deepEqual(alerted, ["contacts"])
  })
})
