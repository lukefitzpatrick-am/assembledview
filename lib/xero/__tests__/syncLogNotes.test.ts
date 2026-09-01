import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR,
  SQL_SYNC_LOG_NOTES_SOURCE_EXPR,
  isCronWatermarkEligibleNotes,
  pickLatestCronWatermarkLog,
} from "../syncLogNotes"
import { resumeInvoiceWatermark } from "../watermark"

describe("cron watermark lookup vs prose xero_sync_log.notes", () => {
  it("does not throw on a prose notes row and resumes from that row's new_watermark", () => {
    const picked = pickLatestCronWatermarkLog([
      {
        id: 12,
        notes: "Sync completed successfully",
        watermark_used: "2026-07-10T00:00:00.000Z",
        new_watermark: "2026-07-11T12:00:00.000Z",
      },
    ])
    assert.ok(picked)
    assert.equal(picked!.id, 12)
    const wm = resumeInvoiceWatermark({
      notes: picked!.notes,
      watermarkUsed: picked!.watermark_used,
      newWatermark: picked!.new_watermark,
    })
    assert.equal(wm.nextPage, 1)
    assert.equal(wm.watermarkStr, "2026-07-11T12:00:00")
  })

  it("excludes a pull-xero JSON row from the cron watermark lookup", () => {
    const picked = pickLatestCronWatermarkLog([
      {
        id: 20,
        notes: JSON.stringify({ source: "pull-xero", stages: {} }),
        watermark_used: "2026-09-01T01:00:00.000Z",
        new_watermark: "2026-09-01T01:05:00.000Z",
      },
      {
        id: 19,
        notes: "Fatal at page 1 after 0 invoices — see exceptions table for the last processed invoice",
        watermark_used: "2026-07-10T00:00:00.000Z",
        new_watermark: "2026-07-11T00:00:00.000Z",
      },
    ])
    assert.ok(picked)
    assert.equal(picked!.id, 19)
    assert.equal(isCronWatermarkEligibleNotes(JSON.stringify({ source: "pull-xero" })), false)
  })

  it("includes a JSON row with no source key", () => {
    const notes = JSON.stringify({ next_page: 4 })
    const picked = pickLatestCronWatermarkLog([
      {
        id: 5,
        notes,
        watermark_used: "2026-08-01T00:00:00.000Z",
        new_watermark: "2026-08-02T00:00:00.000Z",
      },
    ])
    assert.ok(picked)
    assert.equal(picked!.id, 5)
    const wm = resumeInvoiceWatermark({
      notes: picked!.notes,
      watermarkUsed: picked!.watermark_used,
      newWatermark: picked!.new_watermark,
    })
    assert.equal(wm.nextPage, 4)
    assert.equal(wm.watermarkStr, "2026-08-01T00:00:00")
  })

  it("guards the jsonb cast with CASE so prose never reaches notes::jsonb", () => {
    assert.ok(SQL_SYNC_LOG_NOTES_SOURCE_EXPR.includes("CASE"))
    assert.ok(SQL_SYNC_LOG_NOTES_SOURCE_EXPR.includes("~"))
    assert.ok(SQL_SYNC_LOG_NOTES_SOURCE_EXPR.includes("notes::jsonb->>'source'"))
    assert.ok(SQL_SYNC_LOG_NOTES_SOURCE_EXPR.includes("ELSE NULL"))
  })

  it("guards pulled_by the same way so a per-user pull lookup cannot 22P02", () => {
    assert.ok(SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR.includes("CASE"))
    assert.ok(SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR.includes("~"))
    assert.ok(SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR.includes("notes::jsonb->>'pulled_by'"))
    assert.ok(SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR.includes("ELSE NULL"))
  })
})
