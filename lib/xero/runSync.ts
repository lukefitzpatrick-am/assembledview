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
import {
  stageMatchRunItems,
  type MatchRunItemsResult,
} from "./stages/matchRunItems"
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
    match_run_items: MatchRunItemsResult
  }
  sync_log_id?: number
}

export type XeroSyncLogPayload = {
  run_started_at: string
  run_finished_at: string
  status: "success" | "partial_error"
  watermark_used: string
  new_watermark: string
  invoices_upserted: number
  contacts_upserted: number
  notes: Record<string, unknown>
}

export type XeroSyncStageFns = {
  ingestInvoices: typeof stageIngestInvoices
  importBillingRecords: typeof stageImportBillingRecords
  syncPdfs: typeof stageSyncPdfs
  contactsRefresh: typeof stageContactsRefresh
  matchRunItems: typeof stageMatchRunItems
}

async function insertXeroSyncLog(
  payload: XeroSyncLogPayload,
): Promise<number | undefined> {
  const id = Number(
    rowsOf<{ id: number }>(
      await db.execute(sql`
    INSERT INTO xero_sync_log (
      run_started_at, run_finished_at, status,
      watermark_used, new_watermark,
      invoices_upserted, contacts_upserted, notes
    ) VALUES (
      ${payload.run_started_at}::timestamptz,
      ${payload.run_finished_at}::timestamptz,
      ${payload.status},
      ${payload.watermark_used}::timestamptz,
      ${payload.new_watermark}::timestamptz,
      ${payload.invoices_upserted},
      ${payload.contacts_upserted},
      ${JSON.stringify(payload.notes)}
    )
    RETURNING id
  `),
    )[0]?.id ?? 0,
  )
  return id || undefined
}

export async function runXeroSync(opts?: {
  fetchImpl?: typeof fetch
  persistSyncLog?: (payload: XeroSyncLogPayload) => Promise<number | undefined>
  stages?: Partial<XeroSyncStageFns>
}): Promise<XeroSyncRunResult> {
  const runStartedAt = new Date()
  const fetchImpl = opts?.fetchImpl
  const persistSyncLog = opts?.persistSyncLog ?? insertXeroSyncLog
  const ingestInvoices = opts?.stages?.ingestInvoices ?? stageIngestInvoices
  const importBillingRecords =
    opts?.stages?.importBillingRecords ?? stageImportBillingRecords
  const syncPdfs = opts?.stages?.syncPdfs ?? stageSyncPdfs
  const contactsRefresh = opts?.stages?.contactsRefresh ?? stageContactsRefresh
  const matchRunItems = opts?.stages?.matchRunItems ?? stageMatchRunItems

  const ingest = await ingestInvoices({
    fetchImpl,
    runStartedAt,
  })
  if (!ingest.ok) {
    console.error("[xero-sync] ingest_invoices failed", ingest.error, ingest.errors)
  }

  const billing = await importBillingRecords()
  if (!billing.ok) {
    console.error("[xero-sync] import_billing_records failed", billing.error)
  }

  const pdfs = await syncPdfs({ fetchImpl })
  if (!pdfs.ok) {
    console.error("[xero-sync] sync_pdfs failed", pdfs.error)
  }

  const contacts = await contactsRefresh({
    fetchImpl,
    runStartedAt,
  })
  if (!contacts.ok) {
    console.error("[xero-sync] contacts_refresh failed", contacts.error, contacts.errors)
  }

  // PC6: append matcher after ingest substrate is warm (contacts + AR rows).
  const match = await matchRunItems()
  if (!match.ok) {
    console.error("[xero-sync] match_run_items failed", match.error)
  }

  const runFinishedAt = new Date()
  const anyFail = !ingest.ok || !billing.ok || !pdfs.ok || !contacts.ok || !match.ok
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
    match_run_items: {
      ok: match.ok,
      auto_matched: match.auto_matched,
      cards: match.cards,
      reference_hit_rate: match.reference_hit_rate,
      skipped: match.skipped,
      stats: match.stats,
    },
  }

  const invoicesUpserted = ingest.ar_upserted + ingest.ap_upserted
  const logPayload: XeroSyncLogPayload = {
    run_started_at: runStartedAt.toISOString(),
    run_finished_at: runFinishedAt.toISOString(),
    status,
    watermark_used: ingest.watermark_used,
    new_watermark: ingest.new_watermark,
    invoices_upserted: invoicesUpserted,
    contacts_upserted: contacts.contacts_upserted,
    notes,
  }

  let syncLogId: number | undefined
  try {
    syncLogId = await persistSyncLog(logPayload)
  } catch (err) {
    console.error("[xero-sync] failed to write xero_sync_log", err, logPayload)
  }

  return {
    status,
    run_started_at: runStartedAt.toISOString(),
    run_finished_at: runFinishedAt.toISOString(),
    stages: {
      ingest_invoices: ingest,
      import_billing_records: billing,
      sync_pdfs: pdfs,
      contacts_refresh: contacts,
      match_run_items: match,
    },
    sync_log_id: syncLogId,
  }
}

/** Test helper: merge notes without writing (stage isolation unit tests). */
export function mergeStageNotesForTest(
  prevNotes: string | null,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...parseNotesJson(prevNotes), ...patch }
}
