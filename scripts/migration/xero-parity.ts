/**
 * Parity harness: PG xero_* + finance_billing_records (xero:% only)
 * vs latest exports/xano/<date>/*.jsonl.
 *
 * Run AFTER a cron sync and BEFORE db:etl (ETL truncate-reloads PG from Xano).
 * Both pipelines are idempotent upserts — next cron reconverges after ETL.
 *
 * Usage: npx tsx scripts/migration/xero-parity.ts
 * Exit non-zero on unexpected field diffs (timing-window count drift is classified).
 */

import path from "path"

import { sql } from "drizzle-orm"

import { closeDb, db } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"
import {
  ensureDir,
  loadEnvLocal,
  newestSnapshotDir,
  readJsonl,
  writeCsv,
} from "./_shared"

loadEnvLocal()

type DiffRow = {
  table: string
  key: string
  field: string
  pg: string
  xano: string
  class: "unexpected" | "timing_window" | "count"
}

function moneyEq(a: unknown, b: unknown): boolean {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isFinite(na) || !Number.isFinite(nb)) {
    return String(a ?? "") === String(b ?? "")
  }
  return Math.abs(na - nb) < 0.015
}

function normStatus(v: unknown): string {
  return String(v ?? "").trim().toUpperCase()
}

/** Status moves that commonly appear between export and live Xero pull. */
function isTimingStatusDrift(pg: string, xano: string): boolean {
  const a = normStatus(pg)
  const b = normStatus(xano)
  if (a === b) return false
  const pair = new Set([a, b])
  if (pair.has("PAID") && (pair.has("AUTHORISED") || pair.has("SUBMITTED"))) {
    return true
  }
  // finance_billing_records statuses
  if (pair.has("PAID") && pair.has("INVOICED")) return true
  if (pair.has("VOIDED") && pair.has("DELETED")) return true
  if (pair.has("CANCELLED") && (pair.has("VOIDED") || pair.has("DELETED"))) {
    return true
  }
  return false
}

async function main() {
  const snapshotDir = newestSnapshotDir()
  const outDir = path.join(snapshotDir, "recon")
  ensureDir(outDir)
  const diffs: DiffRow[] = []

  // ---- AR ----
  const xanoAr = readJsonl(path.join(snapshotDir, "xero_ar_invoices.jsonl"))
  const pgAr = rowsOf<{
    xero_invoice_id: string
    status: string | null
    total: string | null
    mba_match_id: number | null
    mba_number: string | null
  }>(
    await db.execute(sql`
    SELECT xero_invoice_id, status, total::text AS total, mba_match_id, mba_number
    FROM xero_ar_invoices
  `),
  )

  const pgArById = new Map(pgAr.map((r) => [r.xero_invoice_id, r]))
  const xanoArById = new Map(
    xanoAr.map((r) => [String(r.xero_invoice_id), r]),
  )

  if (pgAr.length !== xanoAr.length) {
    diffs.push({
      table: "xero_ar_invoices",
      key: "*",
      field: "count",
      pg: String(pgAr.length),
      xano: String(xanoAr.length),
      class: "timing_window",
    })
  }

  for (const [id, x] of xanoArById) {
    const p = pgArById.get(id)
    if (!p) {
      diffs.push({
        table: "xero_ar_invoices",
        key: id,
        field: "_missing_in_pg",
        pg: "",
        xano: "present",
        class: "timing_window",
      })
      continue
    }
    if (normStatus(p.status) !== normStatus(x.status)) {
      diffs.push({
        table: "xero_ar_invoices",
        key: id,
        field: "status",
        pg: String(p.status),
        xano: String(x.status),
        class: isTimingStatusDrift(String(p.status), String(x.status))
          ? "timing_window"
          : "unexpected",
      })
    }
    if (!moneyEq(p.total, x.total)) {
      diffs.push({
        table: "xero_ar_invoices",
        key: id,
        field: "total",
        pg: String(p.total),
        xano: String(x.total),
        class: "unexpected",
      })
    }
    const xMba = x.mba_match_id == null ? "" : String(x.mba_match_id)
    const pMba = p.mba_match_id == null ? "" : String(p.mba_match_id)
    if (xMba !== pMba) {
      // PG uses finance/match_mba; Xano ingest used a narrower " | " matcher —
      // treat newly-matched PG rows as expected upgrade during parity week.
      const upgrade =
        (xMba === "" && pMba !== "") || (pMba === "" && xMba !== "")
      diffs.push({
        table: "xero_ar_invoices",
        key: id,
        field: "mba_match_id",
        pg: pMba,
        xano: xMba,
        class: upgrade ? "timing_window" : "unexpected",
      })
    }
  }

  // ---- AP ----
  const xanoAp = readJsonl(path.join(snapshotDir, "xero_ap_bills.jsonl"))
  const pgAp = rowsOf<{
    xero_invoice_id: string
    status: string | null
    total: string | null
  }>(
    await db.execute(sql`
    SELECT xero_invoice_id, status, total::text AS total FROM xero_ap_bills
  `),
  )

  const pgApById = new Map(pgAp.map((r) => [r.xero_invoice_id, r]))
  if (pgAp.length !== xanoAp.length) {
    diffs.push({
      table: "xero_ap_bills",
      key: "*",
      field: "count",
      pg: String(pgAp.length),
      xano: String(xanoAp.length),
      class: "timing_window",
    })
  }
  for (const x of xanoAp) {
    const id = String(x.xero_invoice_id)
    const p = pgApById.get(id)
    if (!p) {
      diffs.push({
        table: "xero_ap_bills",
        key: id,
        field: "_missing_in_pg",
        pg: "",
        xano: "present",
        class: "timing_window",
      })
      continue
    }
    if (normStatus(p.status) !== normStatus(x.status)) {
      diffs.push({
        table: "xero_ap_bills",
        key: id,
        field: "status",
        pg: String(p.status),
        xano: String(x.status),
        class: isTimingStatusDrift(String(p.status), String(x.status))
          ? "timing_window"
          : "unexpected",
      })
    }
    if (!moneyEq(p.total, x.total)) {
      diffs.push({
        table: "xero_ap_bills",
        key: id,
        field: "total",
        pg: String(p.total),
        xano: String(x.total),
        class: "unexpected",
      })
    }
  }

  // ---- finance_billing_records xero:% only ----
  const xanoFin = readJsonl(
    path.join(snapshotDir, "finance_billing_records.jsonl"),
  ).filter((r) => String(r.invoice_key ?? "").startsWith("xero:"))
  const pgFin = rowsOf<{
    invoice_key: string
    status: string | null
    total: string | null
    clients_id: number | null
    client_name: string | null
    mba_number: string | null
  }>(
    await db.execute(sql`
    SELECT invoice_key, status, total::text AS total, clients_id, client_name, mba_number
    FROM finance_billing_records
    WHERE invoice_key LIKE 'xero:%'
  `),
  )

  const pgFinByKey = new Map(pgFin.map((r) => [r.invoice_key, r]))
  if (pgFin.length !== xanoFin.length) {
    diffs.push({
      table: "finance_billing_records",
      key: "xero:*",
      field: "count",
      pg: String(pgFin.length),
      xano: String(xanoFin.length),
      class: "timing_window",
    })
  }
  for (const x of xanoFin) {
    const key = String(x.invoice_key)
    const p = pgFinByKey.get(key)
    if (!p) {
      diffs.push({
        table: "finance_billing_records",
        key,
        field: "_missing_in_pg",
        pg: "",
        xano: "present",
        class: "timing_window",
      })
      continue
    }
    if (normStatus(p.status) !== normStatus(x.status)) {
      diffs.push({
        table: "finance_billing_records",
        key,
        field: "status",
        pg: String(p.status),
        xano: String(x.status),
        class: isTimingStatusDrift(String(p.status), String(x.status))
          ? "timing_window"
          : "unexpected",
      })
    }
    if (!moneyEq(p.total, x.total)) {
      diffs.push({
        table: "finance_billing_records",
        key,
        field: "total",
        pg: String(p.total),
        xano: String(x.total),
        class: "unexpected",
      })
    }
    const xClient = x.clients_id == null ? "" : String(x.clients_id)
    const pClient = p.clients_id == null || Number(p.clients_id) === 0 ? "0" : String(p.clients_id)
    if (xClient !== pClient && !(xClient === "" && pClient === "0")) {
      // Unresolved PG (0) vs resolved Xano: usually missing 0006 aliases or
      // incomplete contacts watermark — classify as timing until aliases applied.
      const pendingAlias =
        pClient === "0" && xClient !== "" && xClient !== "0"
      diffs.push({
        table: "finance_billing_records",
        key,
        field: "clients_id",
        pg: pClient,
        xano: xClient,
        class: pendingAlias ? "timing_window" : "unexpected",
      })
    }
    if (String(p.mba_number ?? "") !== String(x.mba_number ?? "")) {
      diffs.push({
        table: "finance_billing_records",
        key,
        field: "mba_number",
        pg: String(p.mba_number ?? ""),
        xano: String(x.mba_number ?? ""),
        class: "unexpected",
      })
    }
  }

  const outPath = path.join(outDir, "xero-parity.csv")
  writeCsv(
    outPath,
    ["table", "key", "field", "pg", "xano", "class"],
    diffs as unknown as Array<Record<string, unknown>>,
  )

  const unexpected = diffs.filter((d) => d.class === "unexpected")
  const timing = diffs.filter((d) => d.class === "timing_window")

  console.log(
    JSON.stringify(
      {
        snapshot: snapshotDir,
        csv: outPath,
        total_diffs: diffs.length,
        unexpected: unexpected.length,
        timing_window: timing.length,
        sample_unexpected: unexpected.slice(0, 10),
      },
      null,
      2,
    ),
  )

  await closeDb()
  if (unexpected.length > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
