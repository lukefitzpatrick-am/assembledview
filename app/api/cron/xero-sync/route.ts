import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runXeroSync } from "@/lib/xero/runSync"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Daily Xero sync → Postgres only (parity mode until T6).
 * Xano daily_xero_sync stays ACTIVE — do not disable it here.
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    const result = await runXeroSync()
    console.log(
      JSON.stringify({
        event: "xero_sync",
        status: result.status,
        sync_log_id: result.sync_log_id,
        stages: {
          ingest: {
            ar: result.stages.ingest_invoices.ar_upserted,
            ap: result.stages.ingest_invoices.ap_upserted,
            matched: result.stages.ingest_invoices.matched,
            unmatched: result.stages.ingest_invoices.unmatched,
            pages: result.stages.ingest_invoices.pages_fetched,
            ok: result.stages.ingest_invoices.ok,
          },
          billing: {
            imported: result.stages.import_billing_records.imported,
            pending: result.stages.import_billing_records.pending_edits,
            ok: result.stages.import_billing_records.ok,
          },
          pdfs: {
            attempts: result.stages.sync_pdfs.attempts,
            processed: result.stages.sync_pdfs.processed,
            ok: result.stages.sync_pdfs.ok,
          },
            contacts: {
            upserted: result.stages.contacts_refresh.contacts_upserted,
            pages: result.stages.contacts_refresh.pages_fetched,
            ok: result.stages.contacts_refresh.ok,
          },
          match: {
            auto_matched: result.stages.match_run_items.auto_matched,
            cards: result.stages.match_run_items.cards,
            hit_rate: result.stages.match_run_items.reference_hit_rate,
            skipped: result.stages.match_run_items.skipped,
            ok: result.stages.match_run_items.ok,
          },
        },
      }),
    )
    return NextResponse.json(result, {
      status: result.status === "success" ? 200 : 207,
    })
  } catch (err) {
    console.error("[xero-sync] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
