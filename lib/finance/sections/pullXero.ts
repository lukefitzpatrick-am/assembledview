/**
 * Finance-triggered Xero pull: ingest invoices + import billing records only.
 * Does not run PDF or contacts stages. Does not advance the cron watermark
 * (pull rows are tagged notes.source = pull-xero and skipped by ingest resume).
 */

import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/db"
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
}

async function persistPullLog(result: PullXeroResult): Promise<void> {
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
          stages: {
            ingest_invoices: result.ingest,
            import_billing_records: result.import,
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
}): Promise<PullXeroResult> {
  const runStartedAt = new Date()
  const ifModifiedSince = pullXeroIfModifiedSince(runStartedAt)
  const ingest = await stageIngestInvoices({
    fetchImpl: opts?.fetchImpl,
    runStartedAt,
    ifModifiedSince,
  })
  const imported = await stageImportBillingRecords()
  const pulledAt = new Date().toISOString()
  const result: PullXeroResult = {
    ok: ingest.ok && imported.ok,
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
  }
  await persistPullLog(result)
  return result
}
