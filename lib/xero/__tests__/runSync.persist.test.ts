import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { runXeroSync } from "../runSync"
import type { IngestInvoicesResult } from "../stages/ingestInvoices"
import type { ImportBillingResult } from "../stages/importBillingRecords"
import type { SyncPdfsResult } from "../stages/syncPdfs"
import type { ContactsRefreshResult } from "../stages/contactsRefresh"
import type { MatchRunItemsResult } from "../stages/matchRunItems"

function ingestOk(): IngestInvoicesResult {
  return {
    stage: "ingest_invoices",
    ok: true,
    pages_fetched: 1,
    ar_upserted: 10,
    ap_upserted: 4,
    matched: 8,
    unmatched: 2,
    watermark_used: "2024-07-01T00:00:00",
    new_watermark: "2026-09-01T00:15:00.000Z",
    incomplete: false,
    errors: [],
  }
}

function billingOk(): ImportBillingResult {
  return {
    stage: "import_billing_records",
    ok: true,
    imported: 3,
    pending_edits: 0,
    by_type: { media: 3, retainer: 0, sow: 0 },
    skipped_app_keys: 0,
  }
}

function pdfsOk(): SyncPdfsResult {
  return {
    stage: "sync_pdfs",
    ok: true,
    attempts: 2,
    processed: 2,
    ar_pending_seen: 2,
    ap_pending_seen: 0,
  }
}

function contactsOk(): ContactsRefreshResult {
  return {
    stage: "contacts_refresh",
    ok: true,
    pages_fetched: 1,
    contacts_upserted: 5,
    watermark_used: "2024-07-01T00:00:00",
    new_watermark: "2026-09-01T00:15:00.000Z",
    incomplete: false,
    errors: [],
  }
}

function matchOk(): MatchRunItemsResult {
  return {
    stage: "match_run_items",
    ok: true,
    auto_matched: 1,
    cards: 0,
    reference_hit_rate: 1,
    stats: {
      tier1_matched: 1,
      tier1_diverged: 0,
      tier2_suggested: 0,
      duplicates: 0,
      orphans: 0,
    },
  }
}

const stubStages = {
  ingestInvoices: async () => ingestOk(),
  importBillingRecords: async () => billingOk(),
  syncPdfs: async () => pdfsOk(),
  contactsRefresh: async () => contactsOk(),
  matchRunItems: async () => matchOk(),
}

describe("runXeroSync log persist", () => {
  it("returns its result when the xero_sync_log INSERT throws", async () => {
    const errors: unknown[][] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args)
    }
    try {
      const result = await runXeroSync({
        stages: stubStages,
        persistSyncLog: async () => {
          throw new Error("log insert failed")
        },
      })
      assert.equal(result.status, "success")
      assert.equal(result.sync_log_id, undefined)
      assert.equal(result.stages.ingest_invoices.ar_upserted, 10)
      assert.equal(result.stages.ingest_invoices.ap_upserted, 4)
      assert.equal(result.stages.contacts_refresh.contacts_upserted, 5)
      assert.ok(
        errors.some((args) =>
          args.some(
            (a) =>
              typeof a === "string" &&
              a.includes("failed to write xero_sync_log"),
          ),
        ),
        "console.error should include the log-write failure",
      )
      const payloadArg = errors
        .flat()
        .find(
          (a) =>
            a &&
            typeof a === "object" &&
            "invoices_upserted" in (a as object),
        ) as { invoices_upserted?: number; status?: string } | undefined
      assert.ok(payloadArg, "console.error should include the full log payload")
      assert.equal(payloadArg.invoices_upserted, 14)
      assert.equal(payloadArg.status, "success")
    } finally {
      console.error = orig
    }
  })
})
