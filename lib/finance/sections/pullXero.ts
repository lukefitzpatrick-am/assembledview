/**
 * Finance-triggered Xero pull: ingest invoices + import billing records only.
 * Does not run PDF or contacts stages. Does not advance the cron watermark
 * (pull rows are tagged notes.source = pull-xero and skipped by ingest resume).
 */

import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/db"
import {
  persistAutoStamps,
  fetchDraftMatchReport,
  type AutoStampPersistResult,
} from "@/lib/finance/sections/draftMatchQuery"
import { stageImportBillingRecords } from "@/lib/xero/stages/importBillingRecords"
import { stageIngestInvoices } from "@/lib/xero/stages/ingestInvoices"
import { pullXeroIfModifiedSince } from "@/lib/xero/watermark"

export type PullXeroResult = {
  ok: boolean
  pulled_at: string
  ingest: {
    ok: boolean
    pages_fetched: number
    ar_upserted: number
    ap_upserted: number
    watermark_used: string
    incomplete: boolean
    error?: string
  }
  import: {
    ok: boolean
    imported: number
    error?: string
  }
  stamps: AutoStampPersistResult
}

async function persistPullLog(result: PullXeroResult, pulledBy: string | null): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO xero_sync_log (
        run_started_at, run_finished_at, status,
        watermark_used, new_watermark,
        invoices_upserted, contacts_upserted, notes
      ) VALUES (
        ${result.pulled_at}::timestamptz,
        ${result.pulled_at}::timestamptz,
        ${result.ok ? "success" : "partial_error"},
        ${result.ingest.watermark_used}::timestamptz,
        ${result.pulled_at}::timestamptz,
        ${result.ingest.ar_upserted + result.ingest.ap_upserted},
        0,
        ${JSON.stringify({
          source: "pull-xero",
          pulled_by: pulledBy,
          stages: {
            ingest_invoices: result.ingest,
            import_billing_records: result.import,
            draft_match_stamps: result.stamps,
          },
        })}
      )
    `)
  } catch (err) {
    console.error("[pull-xero] failed to write xero_sync_log", err)
  }
}

export async function runPullXero(opts?: {
  fetchImpl?: typeof fetch
  pulledBy?: string
}): Promise<PullXeroResult> {
  const pulledBy = opts?.pulledBy?.trim() || null
  const runStartedAt = new Date()
  const ifModifiedSince = pullXeroIfModifiedSince(runStartedAt)
  const ingest = await stageIngestInvoices({
    fetchImpl: opts?.fetchImpl,
    runStartedAt,
    ifModifiedSince,
  })
  const imported = await stageImportBillingRecords()
  const pulledAt = new Date().toISOString()
  let stamps: AutoStampPersistResult = {
    ok: true,
    stamped: 0,
    unchanged: 0,
    failed: 0,
  }
  try {
    const report = await fetchDraftMatchReport({ clientIds: [] })
    stamps = await persistAutoStamps(report.rows.flatMap((r) => r.stamps))
  } catch (err) {
    console.error("[pull-xero] draft-match stamp failed", err)
    stamps = {
      ok: false,
      stamped: 0,
      unchanged: 0,
      failed: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
  const result: PullXeroResult = {
    ok: ingest.ok && imported.ok && stamps.ok,
    pulled_at: pulledAt,
    ingest: {
      ok: ingest.ok,
      pages_fetched: ingest.pages_fetched,
      ar_upserted: ingest.ar_upserted,
      ap_upserted: ingest.ap_upserted,
      watermark_used: ingest.watermark_used,
      incomplete: ingest.incomplete,
      error: ingest.error,
    },
    import: {
      ok: imported.ok,
      imported: imported.imported,
      error: imported.error,
    },
    stamps,
  }
  await persistPullLog(result, pulledBy)
  return result
}
