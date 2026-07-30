/**
 * Orchestrate the four Xero sync stages. Each stage is isolated:
 * failure → log + partial_error, remaining stages still run.
 */

import { sql } from "drizzle-orm"

import { db } from "@/db"

import { stageContactsRefresh, type ContactsRefreshResult } from "./stages/contactsRefresh"
import {
  stageImportBillingRecords,
  type ImportBillingResult,
} from "./stages/importBillingRecords"
import {
  stageIngestInvoices,
  type IngestInvoicesResult,
} from "./stages/ingestInvoices"
import { stageSyncPdfs, type SyncPdfsResult } from "./stages/syncPdfs"
import { rowsOf } from "./dbRows"
import { parseNotesJson } from "./watermark"

export type XeroSyncRunResult = {
  status: "success" | "partial_error"
  run_started_at: string
  run_finished_at: string
  stages: {
    ingest_invoices: IngestInvoicesResult
    import_billing_records: ImportBillingResult
    sync_pdfs: SyncPdfsResult
    contacts_refresh: ContactsRefreshResult
  }
  sync_log_id?: number
}

export async function runXeroSync(opts?: {
  fetchImpl?: typeof fetch
}): Promise<XeroSyncRunResult> {
  const runStartedAt = new Date()
  const fetchImpl = opts?.fetchImpl

  const ingest = await stageIngestInvoices({
    fetchImpl,
    runStartedAt,
  })
  if (!ingest.ok) {
    console.error("[xero-sync] ingest_invoices failed", ingest.error, ingest.errors)
  }

  const billing = await stageImportBillingRecords()
  if (!billing.ok) {
    console.error("[xero-sync] import_billing_records failed", billing.error)
  }

  const pdfs = await stageSyncPdfs({ fetchImpl })
  if (!pdfs.ok) {
    console.error("[xero-sync] sync_pdfs failed", pdfs.error)
  }

  const contacts = await stageContactsRefresh({
    fetchImpl,
    runStartedAt,
  })
  if (!contacts.ok) {
    console.error("[xero-sync] contacts_refresh failed", contacts.error, contacts.errors)
  }

  const runFinishedAt = new Date()
  const anyFail = !ingest.ok || !billing.ok || !pdfs.ok || !contacts.ok
  const status = anyFail ? "partial_error" : "success"

  // Merge notes: invoice resume + contacts resume keys (same protocol as Xano).
  const notes: Record<string, unknown> = {}
  if (ingest.incomplete && ingest.next_page != null) {
    notes.next_page = ingest.next_page
  }
  if (ingest.errors.length) notes.errors = ingest.errors
  if (contacts.incomplete && contacts.next_page != null) {
    notes.contacts_next_page = contacts.next_page
    notes.contacts_watermark = contacts.watermark_used
  } else {
    notes.contacts_new_watermark = contacts.new_watermark
  }
  notes.stages = {
    ingest_invoices: {
      ok: ingest.ok,
      pages_fetched: ingest.pages_fetched,
      ar_upserted: ingest.ar_upserted,
      ap_upserted: ingest.ap_upserted,
      matched: ingest.matched,
      unmatched: ingest.unmatched,
    },
    import_billing_records: {
      ok: billing.ok,
      imported: billing.imported,
      pending_edits: billing.pending_edits,
      by_type: billing.by_type,
    },
    sync_pdfs: {
      ok: pdfs.ok,
      attempts: pdfs.attempts,
      processed: pdfs.processed,
      ar_pending_seen: pdfs.ar_pending_seen,
      ap_pending_seen: pdfs.ap_pending_seen,
    },
    contacts_refresh: {
      ok: contacts.ok,
      pages_fetched: contacts.pages_fetched,
      contacts_upserted: contacts.contacts_upserted,
    },
  }

  const invoicesUpserted = ingest.ar_upserted + ingest.ap_upserted
  const syncLogId = Number(
    rowsOf<{ id: number }>(
      await db.execute(sql`
    INSERT INTO xero_sync_log (
      run_started_at, run_finished_at, status,
      watermark_used, new_watermark,
      invoices_upserted, contacts_upserted, notes
    ) VALUES (
      ${runStartedAt.toISOString()}::timestamptz,
      ${runFinishedAt.toISOString()}::timestamptz,
      ${status},
      ${ingest.watermark_used}::timestamptz,
      ${ingest.new_watermark}::timestamptz,
      ${invoicesUpserted},
      ${contacts.contacts_upserted},
      ${JSON.stringify(notes)}
    )
    RETURNING id
  `),
    )[0]?.id ?? 0,
  )

  return {
    status,
    run_started_at: runStartedAt.toISOString(),
    run_finished_at: runFinishedAt.toISOString(),
    stages: {
      ingest_invoices: ingest,
      import_billing_records: billing,
      sync_pdfs: pdfs,
      contacts_refresh: contacts,
    },
    sync_log_id: syncLogId || undefined,
  }
}

/** Test helper: merge notes without writing (stage isolation unit tests). */
export function mergeStageNotesForTest(
  prevNotes: string | null,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...parseNotesJson(prevNotes), ...patch }
}
