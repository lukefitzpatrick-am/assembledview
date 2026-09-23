/**
 * The four nightly Xero cron bodies. Each writes its own xero_sync_log row.
 * Invoices then runs today's reference matcher (matchRunItems). The any-status
 * matcher is XL-4 and is not called here.
 */

import { stageContactsRefresh } from "./stages/contactsRefresh"
import { stageImportBillingRecords } from "./stages/importBillingRecords"
import { stageIngestInvoices } from "./stages/ingestInvoices"
import { stageMatchRunItems } from "./stages/matchRunItems"
import { stageSyncPdfs } from "./stages/syncPdfs"
import {
  fetchCronWatermarkRow,
  runLoggedXeroStage,
  type StageRunResult,
  type XeroCronStageResult,
} from "./runLoggedStage"
import { stageBudgetRemainingMs, tickStageBudget } from "./stageBudget"
import { resumeContactsWatermark, resumeInvoiceWatermark } from "./watermark"

function watermarkFromRow(
  row: {
    notes: string | null
    watermark_used: string | null
    new_watermark: string | null
  } | null,
  resume: (last: {
    notes: string | null
    watermarkUsed: string | null
    newWatermark: string | null
  } | null) => { watermarkStr: string },
): string {
  return resume(
    row
      ? {
          notes: row.notes,
          watermarkUsed: row.watermark_used,
          newWatermark: row.new_watermark,
        }
      : null,
  ).watermarkStr
}

export async function runXeroInvoicesCron(): Promise<XeroCronStageResult> {
  const row = await fetchCronWatermarkRow("invoices")
  const watermarkUsed = watermarkFromRow(row, resumeInvoiceWatermark)
  return runLoggedXeroStage({
    stage: "invoices",
    watermarkUsed,
    run: async ({ budget }): Promise<StageRunResult> => {
      const ingest = await stageIngestInvoices({ budget })
      const notes: Record<string, unknown> = {
        ingest,
        next_page: ingest.next_page ?? null,
      }
      if (ingest.ok && !ingest.incomplete) {
        if (
          tickStageBudget(budget).status === "incomplete" ||
          stageBudgetRemainingMs(budget) < 15_000
        ) {
          notes.match_skipped = "budget"
        } else {
          try {
            notes.match = await stageMatchRunItems()
          } catch (err) {
            notes.match_error = err instanceof Error ? err.message : String(err)
          }
        }
      }
      const outcome = !ingest.ok
        ? "failed"
        : ingest.incomplete
          ? "incomplete"
          : "success"
      return {
        outcome,
        newWatermark: outcome === "success" ? ingest.new_watermark : watermarkUsed,
        invoicesUpserted: ingest.ar_upserted + ingest.ap_upserted,
        contactsUpserted: 0,
        notes,
      }
    },
  })
}

export async function runXeroImportCron(): Promise<XeroCronStageResult> {
  return runLoggedXeroStage({
    stage: "import",
    watermarkUsed: null,
    run: async ({ budget }): Promise<StageRunResult> => {
      if (tickStageBudget(budget).status === "incomplete") {
        return {
          outcome: "incomplete",
          newWatermark: null,
          invoicesUpserted: 0,
          contactsUpserted: 0,
          notes: { reason: "budget_before_start" },
        }
      }
      const imported = await stageImportBillingRecords()
      return {
        outcome: imported.ok ? "success" : "failed",
        newWatermark: null,
        invoicesUpserted: imported.imported,
        contactsUpserted: 0,
        notes: { import: imported },
      }
    },
  })
}

export async function runXeroContactsCron(): Promise<XeroCronStageResult> {
  const row = await fetchCronWatermarkRow("contacts")
  const watermarkUsed = watermarkFromRow(row, resumeContactsWatermark)
  return runLoggedXeroStage({
    stage: "contacts",
    watermarkUsed,
    run: async ({ budget }): Promise<StageRunResult> => {
      const contacts = await stageContactsRefresh({ budget })
      const outcome = !contacts.ok
        ? "failed"
        : contacts.incomplete
          ? "incomplete"
          : "success"
      return {
        outcome,
        newWatermark: outcome === "success" ? contacts.new_watermark : watermarkUsed,
        invoicesUpserted: 0,
        contactsUpserted: contacts.contacts_upserted,
        notes: { contacts, next_page: contacts.next_page ?? null },
      }
    },
  })
}

export async function runXeroPdfsCron(): Promise<XeroCronStageResult> {
  return runLoggedXeroStage({
    stage: "pdfs",
    watermarkUsed: null,
    run: async (): Promise<StageRunResult> => {
      const pdfs = await stageSyncPdfs()
      const outcome = !pdfs.ok ? "failed" : pdfs.incomplete ? "incomplete" : "success"
      return {
        outcome,
        newWatermark: null,
        invoicesUpserted: pdfs.processed,
        contactsUpserted: 0,
        notes: { pdfs },
      }
    },
  })
}
