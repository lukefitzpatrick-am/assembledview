/**
 * One-off, resumable Xero backfill. Does not touch the nightly cron routes.
 *
 * Each step writes its own xero_sync_log row with stage = backfill-<step>.
 * Those stages are not cron watermarks.
 *
 *   npm run xero:backfill
 *   npm run xero:backfill -- --step pdfs
 *   npm run xero:backfill -- --from 2025-07-01 --dry-run
 *
 * Plain `tsx` cannot import `@/db` (`server-only` throws). The npm script
 * loads the same server-only shim as the other local DB scripts.
 * `npm run db:xero-sync` is the same shape of local runner; its npm script
 * omits that shim and throws before main.
 */

import { sql, type SQLWrapper } from "drizzle-orm"

import { matchMbaAgainstMasters, type MbaMaster } from "@/lib/xero/matchMba"
import { rowsOf } from "@/lib/xero/dbRows"
import { parseNotesJson } from "@/lib/xero/watermark"

export const XERO_LIST_PAGE_SIZE = 1000
export const XERO_BACKFILL_CALLS_PER_MINUTE = 50
export const XERO_BACKFILL_PAGE_ATTEMPTS = 3
export const XERO_BACKFILL_DAILY_CALL_BUDGET = 4000
export const XERO_DAILY_CAP = 5000
export const XERO_BACKFILL_PDF_BATCH = 10
export const XERO_BACKFILL_PDF_BATCH_PAUSE_MS = 2 * 60 * 1000
export const FY26_END_EXCLUSIVE = "2026-07-01"
export const DEFAULT_FROM = "2025-07-01"

/**
 * PDF backfill pending predicate. The date window is `issue_date >= --from`
 * (default 2025-07-01) with no FY end cap, same open start as sync_pdfs.
 * Xano ETL left a non-null jsonb stub with no `url` key; `->>'url' IS NULL`
 * includes that stub and a JSON null. An empty string url is also pending.
 */
export const PDF_BACKFILL_PENDING_SQL =
  "pdf_file IS NULL OR pdf_file->>'url' IS NULL OR pdf_file->>'url' = ''"

export type PdfBackfillFile = {
  url: string
  pathname: string
  filename: string
  size: number
  uploadedAt: string
}

/**
 * Affected-row count from postgres.js (`count`) or node-pg (`rowCount`).
 * An UPDATE without RETURNING still reports this; the result array length does not.
 */
export function pdfUpdateAffected(result: unknown): number {
  if (!result || typeof result !== "object") return 0
  const record = result as { rowCount?: unknown; count?: unknown }
  if (typeof record.rowCount === "number") return record.rowCount
  if (typeof record.count === "number") return record.count
  return 0
}

/** Writes `pdf_file` only when the row is still pending. Returns affected rows. */
export async function persistBackfillPdfFile(
  execute: (query: SQLWrapper) => Promise<unknown>,
  table: "xero_ar_invoices" | "xero_ap_bills",
  xeroInvoiceId: string,
  pdfFile: PdfBackfillFile,
): Promise<number> {
  const payload = JSON.stringify(pdfFile)
  const result = await execute(sql`
    UPDATE ${sql.raw(table)}
    SET pdf_file = ${payload}::jsonb
    WHERE xero_invoice_id = ${xeroInvoiceId}
      AND (${sql.raw(PDF_BACKFILL_PENDING_SQL)})
  `)
  return pdfUpdateAffected(result)
}

export function pdfBackfillStillMissingQuery(fromYmd: string) {
  return sql`
    SELECT count(*)::int AS n
    FROM (
      SELECT 1 FROM xero_ar_invoices
      WHERE (${sql.raw(PDF_BACKFILL_PENDING_SQL)})
        AND issue_date >= ${fromYmd}::date
      UNION ALL
      SELECT 1 FROM xero_ap_bills
      WHERE (${sql.raw(PDF_BACKFILL_PENDING_SQL)})
        AND issue_date >= ${fromYmd}::date
    ) pending
  `
}

export async function countPdfBackfillStillMissing(
  execute: (query: SQLWrapper) => Promise<unknown>,
  fromYmd: string,
): Promise<number> {
  const rows = rowsOf<{ n: number | string }>(
    await execute(pdfBackfillStillMissingQuery(fromYmd)),
  )
  const n = Number(rows[0]?.n ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function pdfBackfillStepOutcome(
  batchOutcome: "success" | "incomplete",
  stillMissing: number,
): "success" | "incomplete" {
  if (stillMissing > 0) return "incomplete"
  return batchOutcome
}

/** Row-level mirror of `PDF_BACKFILL_PENDING_SQL`. */
export function pdfBackfillUrlMissing(pdfFile: unknown): boolean {
  if (pdfFile == null) return true
  if (typeof pdfFile === "string") {
    try {
      return pdfBackfillUrlMissing(JSON.parse(pdfFile))
    } catch {
      return true
    }
  }
  if (typeof pdfFile !== "object" || Array.isArray(pdfFile)) return true
  if (!Object.prototype.hasOwnProperty.call(pdfFile, "url")) return true
  const url = (pdfFile as { url?: unknown }).url
  return url == null || url === ""
}

export const BACKFILL_STEPS = [
  "invoices",
  "contacts",
  "rematch",
  "pdfs",
  "sql",
] as const

export type BackfillStepName = (typeof BACKFILL_STEPS)[number]

export const EPOCH_EXPORT_STAMP_SQL = `-- Hand-apply in the SQL editor. This script does not execute it.
-- Nulls the epoch-zero export stamps (exported_at = 1970-01-01, exported_by = 0).
UPDATE finance_billing_records
SET exported_at = NULL,
    exported_by = NULL
WHERE exported_at = '1970-01-01'
  AND exported_by = 0;`

const STEP_STAGE: Record<BackfillStepName, string> = {
  invoices: "backfill-invoices",
  contacts: "backfill-contacts",
  rematch: "backfill-rematch",
  pdfs: "backfill-pdfs",
  sql: "backfill-sql",
}

export function xeroIssueDateWhere(fromYmd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromYmd)
  if (!match) throw new Error(`--from must be YYYY-MM-DD, got ${fromYmd}`)
  return `Date>=DateTime(${match[1]},${Number(match[2])},${Number(match[3])})`
}

/** Paged Invoices URL. No If-Modified-Since — that header is not part of the path. */
export function invoiceBackfillPath(page: number, fromYmd: string): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(XERO_LIST_PAGE_SIZE),
    where: xeroIssueDateWhere(fromYmd),
  })
  return `/Invoices?${params.toString()}`
}

export function contactBackfillPath(page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(XERO_LIST_PAGE_SIZE),
  })
  return `/Contacts?${params.toString()}`
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
}

export function dailyBudgetMessage(calls: number, now = new Date()): string {
  const rerun = nextUtcMidnight(now).toISOString()
  return [
    `Stopped at ${calls} Xero calls today (budget ${XERO_BACKFILL_DAILY_CALL_BUDGET} of the ${XERO_DAILY_CAP} connection cap).`,
    `Rerun after ${rerun} (midnight UTC, when the daily cap resets).`,
    `Headroom left for the nightly crons: ${XERO_DAILY_CAP - XERO_BACKFILL_DAILY_CALL_BUDGET}.`,
  ].join("\n")
}

export function resumeBackfillPage(
  log: { status: string; notes: Record<string, unknown> | null } | null,
): number {
  if (!log) return 1
  if (log.status !== "incomplete" && log.status !== "running") return 1
  const page = Number(log.notes?.next_page)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.floor(page)
}

export function createCallPacer(opts?: {
  limit?: number
  windowMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): () => Promise<void> {
  const limit = opts?.limit ?? XERO_BACKFILL_CALLS_PER_MINUTE
  const windowMs = opts?.windowMs ?? 60_000
  const now = opts?.now ?? Date.now
  const sleep =
    opts?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const stamps: number[] = []
  return async function pace() {
    while (true) {
      const t = now()
      while (stamps.length > 0 && t - stamps[0]! >= windowMs) stamps.shift()
      if (stamps.length < limit) {
        stamps.push(t)
        return
      }
      const wait = windowMs - (t - stamps[0]!)
      await sleep(Math.max(0, wait))
    }
  }
}

export async function walkPagedResource<T>(args: {
  startPage: number
  maxAttempts?: number
  fetchPage: (page: number) => Promise<{ ok: boolean; items: T[] }>
  onPage?: (page: number, items: T[]) => Promise<void>
  shouldStop?: () => "budget" | null
}): Promise<{
  outcome: "success" | "incomplete"
  nextPage: number | null
  pagesFetched: number
  stopReason?: "budget" | "retries"
}> {
  const maxAttempts = args.maxAttempts ?? XERO_BACKFILL_PAGE_ATTEMPTS
  let page = args.startPage
  let pagesFetched = 0
  while (true) {
    let result: { ok: boolean; items: T[] } | null = null
    let succeeded = false
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (args.shouldStop?.() === "budget") {
        return {
          outcome: "incomplete",
          nextPage: page,
          pagesFetched,
          stopReason: "budget",
        }
      }
      try {
        result = await args.fetchPage(page)
        if (result.ok) {
          succeeded = true
          break
        }
      } catch {
        result = null
      }
    }
    if (!succeeded || !result?.ok) {
      return {
        outcome: "incomplete",
        nextPage: page,
        pagesFetched,
        stopReason: "retries",
      }
    }
    if (result.items.length === 0) {
      return { outcome: "success", nextPage: null, pagesFetched }
    }
    if (args.onPage) await args.onPage(page, result.items)
    pagesFetched += 1
    page += 1
  }
}

export async function runPdfBatches<T>(args: {
  rows: T[]
  callsUsedToday: number
  dailyBudget?: number
  batchSize?: number
  pauseMs?: number
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  fetchRow: (row: T) => Promise<{
    calls: number
    stored: boolean
    kind?: "reused" | "fetched" | "unstored"
  }>
  onBatch: (info: {
    batchIndex: number
    stored: number
    reused: number
    fetched: number
    unstored: number
    calls: number
    remaining: number
  }) => void | Promise<void>
}): Promise<{
  outcome: "success" | "incomplete"
  callsUsedToday: number
  remainingRows: number
  rerunAfterUtc: string | null
  stored: number
  reused: number
  fetched: number
  unstored: number
}> {
  const budget = args.dailyBudget ?? XERO_BACKFILL_DAILY_CALL_BUDGET
  const batchSize = args.batchSize ?? XERO_BACKFILL_PDF_BATCH
  const pauseMs = args.pauseMs ?? XERO_BACKFILL_PDF_BATCH_PAUSE_MS
  const now = args.now ?? (() => new Date())
  const sleep =
    args.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let calls = args.callsUsedToday
  let index = 0
  let stored = 0
  let reused = 0
  let fetched = 0
  let unstored = 0
  let batchIndex = 0
  let inBatch = 0

  const finish = (outcome: "success" | "incomplete") => ({
    outcome,
    callsUsedToday: calls,
    remainingRows: args.rows.length - index,
    rerunAfterUtc:
      outcome === "incomplete" ? nextUtcMidnight(now()).toISOString() : null,
    stored,
    reused,
    fetched,
    unstored,
  })

  while (index < args.rows.length) {
    if (calls >= budget) return finish("incomplete")
    const row = args.rows[index]!
    const result = await args.fetchRow(row)
    calls += result.calls
    if (result.kind === "reused" && result.stored) {
      reused += 1
      stored += 1
    } else if (result.kind === "fetched" && result.stored) {
      fetched += 1
      stored += 1
    } else if (result.kind === "unstored") {
      unstored += 1
    } else if (result.stored) {
      stored += 1
    }
    index += 1
    inBatch += 1
    const hitBudget = calls >= budget
    const batchFull = inBatch >= batchSize
    const noMoreRows = index >= args.rows.length
    if (batchFull || noMoreRows || hitBudget) {
      batchIndex += 1
      await args.onBatch({
        batchIndex,
        stored,
        reused,
        fetched,
        unstored,
        calls,
        remaining: args.rows.length - index,
      })
      if (index < args.rows.length && calls < budget) await sleep(pauseMs)
      inBatch = 0
    }
  }
  return finish("success")
}

export type RematchInputRow = {
  id: number
  referenceRaw: string | null
  mbaNumber: string | null
}

export async function applyPublishedMbaRematch(args: {
  rows: RematchInputRow[]
  publishedMasters: MbaMaster[]
  write: (row: {
    id: number
    mbaNumber: string
    masterId: number
  }) => Promise<void>
}): Promise<{
  changed: Array<{ id: number; mbaNumber: string }>
  two: Array<{ id: number; matches: string[] }>
  none: Array<{ id: number }>
}> {
  const changed: Array<{ id: number; mbaNumber: string }> = []
  const two: Array<{ id: number; matches: string[] }> = []
  const none: Array<{ id: number }> = []

  for (const row of args.rows) {
    if ((row.mbaNumber ?? "").trim() !== "") continue
    const result = matchMbaAgainstMasters(
      row.referenceRaw ?? "",
      args.publishedMasters,
      [],
    )
    if (result.matched && result.kind === "mba") {
      await args.write({
        id: row.id,
        mbaNumber: result.mba_number,
        masterId: result.id,
      })
      changed.push({ id: row.id, mbaNumber: result.mba_number })
      continue
    }
    if (
      !result.matched &&
      result.reason === "ambiguous" &&
      result.matchKind === "mba"
    ) {
      two.push({ id: row.id, matches: result.matches })
      continue
    }
    none.push({ id: row.id })
  }

  return { changed, two, none }
}

export function formatRematchTable(summary: {
  changed: Array<{ id: number; mbaNumber: string }>
  two: Array<{ id: number; matches: string[] }>
  none: Array<{ id: number }>
}): string {
  const lines = [
    "bucket            rows",
    `changed           ${summary.changed.length}`,
    `two candidates    ${summary.two.length}`,
    `none              ${summary.none.length}`,
  ]
  if (summary.changed.length > 0) {
    lines.push("", "changed:")
    for (const row of summary.changed) {
      lines.push(`  ${row.id}  ${row.mbaNumber}`)
    }
  }
  if (summary.two.length > 0) {
    lines.push("", "two candidates:")
    for (const row of summary.two) {
      lines.push(`  ${row.id}  ${row.matches.join(", ")}`)
    }
  }
  return lines.join("\n")
}

export function parseBackfillArgs(argv: string[]): {
  from: string
  step: BackfillStepName | "all"
  dryRun: boolean
} {
  let from = DEFAULT_FROM
  let step: BackfillStepName | "all" = "all"
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--dry-run") {
      dryRun = true
      continue
    }
    if (arg === "--from") {
      from = argv[++i] ?? ""
      continue
    }
    if (arg.startsWith("--from=")) {
      from = arg.slice("--from=".length)
      continue
    }
    if (arg === "--step") {
      step = (argv[++i] ?? "") as BackfillStepName
      continue
    }
    if (arg.startsWith("--step=")) {
      step = arg.slice("--step=".length) as BackfillStepName
      continue
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("HELP")
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    throw new Error(`--from must be YYYY-MM-DD, got ${from}`)
  }
  if (step !== "all" && !BACKFILL_STEPS.includes(step)) {
    throw new Error("--step must be invoices|contacts|rematch|pdfs|sql")
  }
  return { from, step, dryRun }
}

type StepOutcome = "success" | "incomplete" | "failed"

type LogRow = {
  status: string | null
  notes: string | null
}

function isDirectRun(): boolean {
  const entry = (process.argv[1] ?? "").replace(/\\/g, "/")
  return (
    entry.endsWith("/scripts/xero-backfill.ts") ||
    entry.endsWith("/scripts/xero-backfill.js")
  )
}

function helpText(): string {
  return [
    "Usage: npm run xero:backfill -- [--from YYYY-MM-DD] [--step invoices|contacts|rematch|pdfs|sql] [--dry-run]",
    `  --from     issue_date lower bound (default ${DEFAULT_FROM})`,
    "  --step     run one step (default: all, skipping a step whose newest log is success)",
    "  --dry-run  counts only; no upserts, no Blob writes, no log rows, SQL still printed",
  ].join("\n")
}

async function main(): Promise<number> {
  const { loadEnvLocal } = await import("./migration/_shared")
  loadEnvLocal()

  let args: ReturnType<typeof parseBackfillArgs>
  try {
    args = parseBackfillArgs(process.argv.slice(2))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === "HELP") {
      console.log(helpText())
      return 0
    }
    console.error(message)
    console.error(helpText())
    return 1
  }

  const { sql } = await import("drizzle-orm")
  const { closeDb, db } = await import("@/db")
  const { rowsOf } = await import("@/lib/xero/dbRows")
  const { clearXeroTokenCache, getXeroAccessToken, xeroApiRequest } =
    await import("@/lib/xero/client")
  const { upsertPagedXeroInvoice } = await import(
    "@/lib/xero/stages/ingestInvoices"
  )
  const { upsertPagedXeroContact } = await import(
    "@/lib/xero/stages/contactsRefresh"
  )
  const { PDF_429_MAX_ATTEMPTS, delayMsFor429 } = await import(
    "@/lib/xero/stages/syncPdfs"
  )
  const { BlobNotFoundError, head, put } = await import("@vercel/blob")
  const { parseXeroDateString } = await import("@/lib/xero/parseXeroDate")

  clearXeroTokenCache()
  const pace = createCallPacer()
  const startedPrior = await sumBackfillCallsSinceUtcMidnight(db, sql, rowsOf)
  let runCalls = 0
  const dayCalls = () => startedPrior + runCalls

  const steps: BackfillStepName[] =
    args.step === "all" ? [...BACKFILL_STEPS] : [args.step]

  let exit = 0
  try {
    for (const step of steps) {
      const result = await runStep(step)
      console.log(
        JSON.stringify({ step, ...result, dry_run: args.dryRun }, null, 2),
      )
      if (result.outcome === "incomplete") {
        exit = 2
        break
      }
      if (result.outcome === "failed") {
        exit = 1
        break
      }
    }
  } finally {
    await closeDb()
  }
  return exit

  async function runStep(step: BackfillStepName): Promise<{
    outcome: StepOutcome
    skipped?: boolean
    notes: Record<string, unknown>
  }> {
    const stage = STEP_STAGE[step]
    const latest = await latestBackfillLog(db, sql, rowsOf, stage)
    if (
      args.step === "all" &&
      step !== "sql" &&
      latest?.status === "success"
    ) {
      console.log(`${step}: newest log is success — skipping`)
      return { outcome: "success", skipped: true, notes: { skipped: true } }
    }

    if (step === "sql") return runSqlStep(stage)
    if (args.dryRun && step === "pdfs") return dryRunPdfs()
    if (args.dryRun && step === "rematch") return dryRunRematch()

    const startPage = resumeBackfillPage(
      latest
        ? { status: latest.status ?? "", notes: parseNotesJson(latest.notes) }
        : null,
    )
    const openingNotes = {
      source: "xero-backfill",
      step,
      from: args.from,
      dry_run: args.dryRun,
      next_page: step === "invoices" || step === "contacts" ? startPage : null,
    }
    const logId = args.dryRun
      ? null
      : await openBackfillLog(db, sql, rowsOf, stage, openingNotes)
    const started = Date.now()
    const notes: Record<string, unknown> = { ...openingNotes }
    try {
    if (step === "invoices") await runInvoices(logId, notes, startPage)
    else if (step === "contacts") await runContacts(logId, notes, startPage)
      else if (step === "rematch") await runRematch(notes)
      else await runPdfs(logId, notes)

      const outcome = (notes.outcome as StepOutcome) ?? "success"
      if (!args.dryRun && logId != null) {
        await finishBackfillLog(db, sql, {
          id: logId,
          status: outcome,
          notes,
          invoices: Number(notes.ar_upserted ?? 0) + Number(notes.ap_upserted ?? 0),
          contacts: Number(notes.contacts_upserted ?? 0),
          durationMs: Date.now() - started,
        })
      }
      if (outcome === "incomplete" && notes.stop_reason === "budget") {
        console.log(dailyBudgetMessage(dayCalls()))
      }
      return { outcome, notes }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      notes.error = message
      if (notes.outcome !== "incomplete") notes.outcome = "failed"
      const outcome = notes.outcome === "incomplete" ? "incomplete" : "failed"
      if (!args.dryRun && logId != null) {
        await finishBackfillLog(db, sql, {
          id: logId,
          status: outcome,
          notes,
          invoices: Number(notes.ar_upserted ?? 0) + Number(notes.ap_upserted ?? 0),
          contacts: Number(notes.contacts_upserted ?? 0),
          durationMs: Date.now() - started,
        })
      }
      return { outcome, notes }
    }
  }

  async function runSqlStep(stage: string): Promise<{
    outcome: StepOutcome
    notes: Record<string, unknown>
  }> {
    console.log(EPOCH_EXPORT_STAMP_SQL)
    const notes = {
      source: "xero-backfill",
      step: "sql",
      executed: false,
    }
    if (!args.dryRun) {
      const logId = await openBackfillLog(db, sql, rowsOf, stage, notes)
      await finishBackfillLog(db, sql, {
        id: logId,
        status: "success",
        notes,
        invoices: 0,
        contacts: 0,
        durationMs: 0,
      })
    }
    return { outcome: "success", notes }
  }

  async function runInvoices(
    logId: number | null,
    notes: Record<string, unknown>,
    startPage: number,
  ): Promise<void> {
    console.log(`invoices: start page ${startPage}, from ${args.from}`)
    const token = await getXeroAccessToken()
    let ar = 0
    let ap = 0
    let skippedBefore = 0
    const walk = await walkPagedResource({
      startPage,
      fetchPage: async (page) => {
        await pace()
        runCalls += 1
        notes.api_calls = runCalls
        const api = await xeroApiRequest({
          accessToken: token,
          path: invoiceBackfillPath(page, args.from),
        })
        if (api.status === 429) {
          await sleep(delayMsFor429(api.headers, 1))
          return { ok: false, items: [] }
        }
        if (api.status >= 400) return { ok: false, items: [] }
        const body = api.body as { Invoices?: Parameters<typeof upsertPagedXeroInvoice>[0][] }
        return { ok: true, items: body.Invoices ?? [] }
      },
      shouldStop: () =>
        dayCalls() >= XERO_BACKFILL_DAILY_CALL_BUDGET ? "budget" : null,
      onPage: async (page, invoices) => {
        notes.next_page = page
        try {
        for (const inv of invoices) {
          const issueDate = parseXeroDateString(inv.DateString)
          if (issueDate && issueDate < args.from) {
            skippedBefore += 1
            continue
          }
          if (args.dryRun) {
            if (inv.Type === "ACCREC" || inv.Type === "ACCRECCREDIT") ar += 1
            else if (inv.Type === "ACCPAY") ap += 1
            continue
          }
          const persisted = await upsertPagedXeroInvoice(inv, new Date())
          if (persisted.kind === "ar") ar += 1
          else if (persisted.kind === "ap") ap += 1
        }
        notes.ar_upserted = ar
        notes.ap_upserted = ap
        notes.next_page = page + 1
        notes.api_calls = runCalls
        if (logId != null) {
          await touchBackfillLog(db, sql, logId, notes, ar + ap, 0)
        }
        console.log(
          `invoices page ${page}: ar ${ar}, ap ${ap}, calls today ${dayCalls()}`,
        )
        } catch (err) {
          notes.outcome = "incomplete"
          notes.next_page = page
          notes.stop_reason = "retries"
          notes.error = err instanceof Error ? err.message : String(err)
          throw err
        }
      },
    })
    notes.ar_upserted = ar
    notes.ap_upserted = ap
    notes.skipped_before_from = skippedBefore
    notes.pages_fetched = walk.pagesFetched
    notes.api_calls = runCalls
    if (walk.outcome === "incomplete") {
      notes.outcome = "incomplete"
      notes.next_page = walk.nextPage
      notes.stop_reason = walk.stopReason ?? "retries"
      if (walk.stopReason === "budget") {
        notes.rerun_after_utc = nextUtcMidnight(new Date()).toISOString()
      }
      return
    }
    notes.outcome = "success"
    notes.next_page = null
  }

  async function runContacts(
    logId: number | null,
    notes: Record<string, unknown>,
    startPage: number,
  ): Promise<void> {
    console.log(`contacts: start page ${startPage}`)
    const token = await getXeroAccessToken()
    let upserted = 0
    const walk = await walkPagedResource({
      startPage,
      fetchPage: async (page) => {
        await pace()
        runCalls += 1
        notes.api_calls = runCalls
        const api = await xeroApiRequest({
          accessToken: token,
          path: contactBackfillPath(page),
        })
        if (api.status === 429) {
          await sleep(delayMsFor429(api.headers, 1))
          return { ok: false, items: [] }
        }
        if (api.status >= 400) return { ok: false, items: [] }
        const body = api.body as {
          Contacts?: Parameters<typeof upsertPagedXeroContact>[0][]
        }
        return { ok: true, items: body.Contacts ?? [] }
      },
      shouldStop: () =>
        dayCalls() >= XERO_BACKFILL_DAILY_CALL_BUDGET ? "budget" : null,
      onPage: async (page, contacts) => {
        notes.next_page = page
        try {
          if (!args.dryRun) {
            for (const contact of contacts) {
              await upsertPagedXeroContact(contact)
              upserted += 1
            }
          } else {
            upserted += contacts.length
          }
          notes.contacts_upserted = upserted
          notes.next_page = page + 1
          notes.api_calls = runCalls
          if (logId != null) {
            await touchBackfillLog(db, sql, logId, notes, 0, upserted)
          }
          console.log(
            `contacts page ${page}: upserted ${upserted}, calls today ${dayCalls()}`,
          )
        } catch (err) {
          notes.outcome = "incomplete"
          notes.next_page = page
          notes.stop_reason = "retries"
          notes.error = err instanceof Error ? err.message : String(err)
          throw err
        }
      },
    })
    notes.contacts_upserted = upserted
    notes.pages_fetched = walk.pagesFetched
    notes.api_calls = runCalls
    if (walk.outcome === "incomplete") {
      notes.outcome = "incomplete"
      notes.next_page = walk.nextPage
      notes.stop_reason = walk.stopReason ?? "retries"
      if (walk.stopReason === "budget") {
        notes.rerun_after_utc = nextUtcMidnight(new Date()).toISOString()
      }
      return
    }
    notes.outcome = "success"
    notes.next_page = null
  }

  async function loadPublishedMasters(): Promise<MbaMaster[]> {
    const rows = rowsOf<{ id: number; mba_number: string }>(
      await db.execute(sql`
        SELECT m.id, m.mba_number
        FROM media_plan_masters m
        INNER JOIN media_plan_versions v ON v.id = m.published_version_id
        WHERE m.mba_number IS NOT NULL
          AND btrim(m.mba_number) <> ''
          AND v.published_at IS NOT NULL
      `),
    )
    return rows.map((row) => ({
      id: Number(row.id),
      mba_number: String(row.mba_number),
    }))
  }

  async function loadFy26Ar(): Promise<RematchInputRow[]> {
    const rows = rowsOf<{
      id: number
      reference_raw: string | null
      mba_number: string | null
    }>(
      await db.execute(sql`
        SELECT id, reference_raw, mba_number
        FROM xero_ar_invoices
        WHERE issue_date >= ${args.from}::date
          AND issue_date < ${FY26_END_EXCLUSIVE}::date
        ORDER BY id
      `),
    )
    return rows.map((row) => ({
      id: Number(row.id),
      referenceRaw: row.reference_raw,
      mbaNumber: row.mba_number,
    }))
  }

  async function dryRunRematch(): Promise<{
    outcome: StepOutcome
    notes: Record<string, unknown>
  }> {
    const summary = await applyPublishedMbaRematch({
      rows: await loadFy26Ar(),
      publishedMasters: await loadPublishedMasters(),
      write: async () => {},
    })
    console.log(formatRematchTable(summary))
    return {
      outcome: "success",
      notes: {
        changed: summary.changed.length,
        two: summary.two.length,
        none: summary.none.length,
        dry_run: true,
      },
    }
  }

  async function runRematch(notes: Record<string, unknown>): Promise<void> {
    const summary = await applyPublishedMbaRematch({
      rows: await loadFy26Ar(),
      publishedMasters: await loadPublishedMasters(),
      write: async (row) => {
        if (args.dryRun) return
        await db.execute(sql`
          UPDATE xero_ar_invoices
          SET mba_number = ${row.mbaNumber},
              mba_match_id = ${row.masterId}
          WHERE id = ${row.id}
            AND (mba_number IS NULL OR btrim(mba_number) = '')
        `)
      },
    })
    console.log(formatRematchTable(summary))
    notes.changed = summary.changed.length
    notes.two = summary.two.length
    notes.none = summary.none.length
    notes.outcome = "success"
  }

  async function listPendingPdfs(
    table: "xero_ar_invoices" | "xero_ap_bills",
  ): Promise<
    Array<{
      xero_invoice_id: string
      invoice_number: string | null
      kind: "AR" | "AP"
    }>
  > {
    const kind = table === "xero_ar_invoices" ? "AR" : "AP"
    const rows = rowsOf<{
      xero_invoice_id: string
      invoice_number: string | null
    }>(
      await db.execute(sql`
        SELECT xero_invoice_id, invoice_number
        FROM ${sql.raw(table)}
        WHERE (${sql.raw(PDF_BACKFILL_PENDING_SQL)})
          AND issue_date >= ${args.from}::date
        ORDER BY id
      `),
    )
    return rows.map((row) => ({
      xero_invoice_id: String(row.xero_invoice_id),
      invoice_number: row.invoice_number,
      kind,
    }))
  }

  async function dryRunPdfs(): Promise<{
    outcome: StepOutcome
    notes: Record<string, unknown>
  }> {
    const ar = await listPendingPdfs("xero_ar_invoices")
    const ap = await listPendingPdfs("xero_ap_bills")
    console.log(
      `pdfs dry-run: AR ${ar.length}, AP ${ap.length} in scope (${PDF_BACKFILL_PENDING_SQL}), issue_date >= ${args.from}`,
    )
    return {
      outcome: "success",
      notes: {
        ar: ar.length,
        ap: ap.length,
        selector: PDF_BACKFILL_PENDING_SQL,
        dry_run: true,
      },
    }
  }

  async function runPdfs(
    logId: number | null,
    notes: Record<string, unknown>,
  ): Promise<void> {
    const rows = [
      ...(await listPendingPdfs("xero_ar_invoices")),
      ...(await listPendingPdfs("xero_ap_bills")),
    ]
    console.log(
      `pdfs: ${rows.length} rows in scope (${PDF_BACKFILL_PENDING_SQL}), issue_date >= ${args.from}`,
    )
    let token: string | null = null
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    const execute = (query: SQLWrapper) => db.execute(query)
    const batch = await runPdfBatches({
      rows,
      callsUsedToday: dayCalls(),
      fetchRow: async (row) => {
        const filename = `${row.invoice_number || row.xero_invoice_id}.pdf`
        const pathname = `xero-invoices/${row.xero_invoice_id}/${filename}`
        const table =
          row.kind === "AR" ? "xero_ar_invoices" : "xero_ap_bills"
        const classify = (
          affected: number,
          calls: number,
          kind: "reused" | "fetched",
        ) => {
          if (affected === 1) return { calls, stored: true, kind }
          if (affected === 0) return { calls, stored: false, kind: "unstored" as const }
          throw new Error(
            `pdf_file update for ${row.xero_invoice_id} affected ${affected} rows`,
          )
        }
        let existing: Awaited<ReturnType<typeof head>> | null = null
        try {
          existing = await head(pathname, { token: blobToken })
        } catch (error) {
          if (!(error instanceof BlobNotFoundError)) throw error
        }
        if (existing) {
          const file = {
            url: existing.url,
            pathname: existing.pathname,
            filename,
            size: existing.size,
            uploadedAt: existing.uploadedAt.toISOString(),
          }
          const affected = await persistBackfillPdfFile(
            execute,
            table,
            row.xero_invoice_id,
            file,
          )
          return classify(affected, 0, "reused")
        }

        let calls = 0
        let api: Awaited<ReturnType<typeof xeroApiRequest>> | undefined
        if (!token) token = await getXeroAccessToken()
        for (let attempt = 1; attempt <= PDF_429_MAX_ATTEMPTS; attempt++) {
          if (dayCalls() >= XERO_BACKFILL_DAILY_CALL_BUDGET) {
            return { calls, stored: false }
          }
          await pace()
          runCalls += 1
          calls += 1
          api = await xeroApiRequest({
            accessToken: token,
            path: `/Invoices/${row.xero_invoice_id}`,
            accept: "application/pdf",
          })
          if (api.status !== 429) break
          await sleep(delayMsFor429(api.headers, attempt))
        }
        const buf = api?.body as ArrayBuffer | undefined
        const contentType = api?.headers.get("content-type") ?? ""
        const magic = buf ? Buffer.from(buf.slice(0, 4)).toString("utf8") : ""
        const ok =
          api != null &&
          api.status < 400 &&
          buf != null &&
          (magic === "%PDF" || contentType.includes("application/pdf"))
        if (!ok || !buf) return { calls, stored: false }
        const bytes = Buffer.from(buf)
        const blob = await put(pathname, bytes, {
          access: "private",
          contentType: "application/pdf",
          addRandomSuffix: false,
          allowOverwrite: false,
          token: blobToken,
        })
        const file = {
          url: blob.url,
          pathname: blob.pathname,
          filename,
          size: bytes.byteLength,
          uploadedAt: new Date().toISOString(),
        }
        const affected = await persistBackfillPdfFile(
          execute,
          table,
          row.xero_invoice_id,
          file,
        )
        return classify(affected, calls, "fetched")
      },
      onBatch: async (info) => {
        console.log(
          `pdf batch ${info.batchIndex}: stored ${info.stored}, reused ${info.reused}, fetched ${info.fetched}, unstored ${info.unstored}, calls today ${info.calls}, remaining ${info.remaining}`,
        )
        notes.stored = info.stored
        notes.reused = info.reused
        notes.fetched = info.fetched
        notes.unstored = info.unstored
        notes.api_calls = runCalls
        notes.remaining = info.remaining
        if (logId != null) {
          await touchBackfillLog(db, sql, logId, notes, 0, 0)
        }
      },
    })
    const stillMissing = await countPdfBackfillStillMissing(execute, args.from)
    notes.stored = batch.stored
    notes.reused = batch.reused
    notes.fetched = batch.fetched
    notes.unstored = batch.unstored
    notes.still_missing = stillMissing
    notes.pending = rows.length
    notes.api_calls = runCalls
    notes.calls_today = batch.callsUsedToday
    const outcome = pdfBackfillStepOutcome(batch.outcome, stillMissing)
    notes.outcome = outcome
    if (batch.outcome === "incomplete") {
      notes.stop_reason = "budget"
      notes.rerun_after_utc = batch.rerunAfterUtc
      return
    }
    if (outcome === "incomplete") notes.stop_reason = "still_missing"
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function latestBackfillLog(
  db: { execute: (q: unknown) => Promise<unknown> },
  sql: typeof import("drizzle-orm").sql,
  rowsOf: <T>(result: unknown) => T[],
  stage: string,
): Promise<LogRow | null> {
  const rows = rowsOf<LogRow>(
    await db.execute(sql`
      SELECT status, notes
      FROM xero_sync_log
      WHERE stage = ${stage}
      ORDER BY id DESC
      LIMIT 1
    `),
  )
  return rows[0] ?? null
}

async function sumBackfillCallsSinceUtcMidnight(
  db: { execute: (q: unknown) => Promise<unknown> },
  sql: typeof import("drizzle-orm").sql,
  rowsOf: <T>(result: unknown) => T[],
): Promise<number> {
  const now = new Date()
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString()
  const rows = rowsOf<{ notes: string | null }>(
    await db.execute(sql`
      SELECT notes
      FROM xero_sync_log
      WHERE stage LIKE 'backfill-%'
        AND run_started_at >= ${midnight}::timestamptz
    `),
  )
  let sum = 0
  for (const row of rows) {
    const n = Number(parseNotesJson(row.notes).api_calls)
    if (Number.isFinite(n) && n > 0) sum += n
  }
  return sum
}

async function openBackfillLog(
  db: { execute: (q: unknown) => Promise<unknown> },
  sql: typeof import("drizzle-orm").sql,
  rowsOf: <T>(result: unknown) => T[],
  stage: string,
  notes: Record<string, unknown>,
): Promise<number> {
  const rows = rowsOf<{ id: number | string }>(
    await db.execute(sql`
      INSERT INTO xero_sync_log (
        run_started_at, status, stage, invoices_upserted, contacts_upserted, notes
      ) VALUES (
        now(),
        'running',
        ${stage},
        0,
        0,
        ${JSON.stringify({ ...notes, stage, status: "running" })}
      )
      RETURNING id
    `),
  )
  const id = Number(rows[0]?.id)
  if (!Number.isFinite(id)) {
    throw new Error("xero_sync_log running insert did not return an id")
  }
  return id
}

async function touchBackfillLog(
  db: { execute: (q: unknown) => Promise<unknown> },
  sql: typeof import("drizzle-orm").sql,
  id: number,
  notes: Record<string, unknown>,
  invoices: number,
  contacts: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE xero_sync_log SET
      notes = ${JSON.stringify(notes)},
      invoices_upserted = ${invoices},
      contacts_upserted = ${contacts}
    WHERE id = ${id}
  `)
}

async function finishBackfillLog(
  db: { execute: (q: unknown) => Promise<unknown> },
  sql: typeof import("drizzle-orm").sql,
  args: {
    id: number
    status: StepOutcome
    notes: Record<string, unknown>
    invoices: number
    contacts: number
    durationMs: number
  },
): Promise<void> {
  await db.execute(sql`
    UPDATE xero_sync_log SET
      run_finished_at = now(),
      status = ${args.status},
      invoices_upserted = ${args.invoices},
      contacts_upserted = ${args.contacts},
      duration_ms = ${args.durationMs},
      notes = ${JSON.stringify({ ...args.notes, status: args.status })}
    WHERE id = ${args.id}
  `)
}

if (isDirectRun()) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
