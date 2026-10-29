/**
 * Monthly true-up run (design T10). 07:00 Sydney on the 2nd: build the report
 * for the month just ended (from the start of its financial year), save it
 * as a true_up_runs row and email the summary to OPS_EMAIL_TO through the
 * internal SendGrid path. Read only on plans: it never changes a schedule.
 *
 * The cron needs TRUE_UP and TRUE_UP_CRON, plus migration 0109. One cron run
 * per as-of month: a second call after the email went is a no-op. "Run now"
 * (finance admin, TRUE_UP_ACTIONS) always runs and emails.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { getSydneyWallClock } from "@/lib/finance/periods/sydneyClock"
import { rowsOf } from "@/lib/xero/dbRows"

import { isTrueUpCronEnabled, isTrueUpEnabled } from "./flag"
import { loadTrueUp } from "./load"
import { isTrueUpMigrationApplied } from "./marker"
import { buildTrueUpRunEmail, compactRunRows, trueUpRunMonths } from "./monthlyRunModel"
import type { TrueUpReport } from "./compute"

export type TrueUpRunSource = "cron" | "manual"

export type TrueUpRunResult =
  | { ok: true; skipped: "disabled" | "not_ready" | "outside_window" | "already_sent"; asOfMonth?: string }
  | {
      ok: true
      status: "sent" | "saved_not_emailed"
      runId: number
      asOfMonth: string
      fromMonth: string
      mbasNeedingAction: number
      emailError?: string
    }

export type TrueUpRunIo = {
  load?: (args: { asOfMonth: string; fromMonth: string }) => Promise<TrueUpReport>
  migrationApplied?: () => Promise<boolean>
  alreadySent?: (asOfMonth: string) => Promise<boolean>
  saveRun?: (row: TrueUpRunInsert) => Promise<number>
  markEmailed?: (runId: number) => Promise<void>
  send?: (params: { to: string[]; subject: string; html: string }) => Promise<void>
  recipients?: string[]
  appBaseUrl?: string
}

export type TrueUpRunInsert = {
  asOfMonth: string
  fromMonth: string
  source: TrueUpRunSource
  createdBy: number | null
  createdByName: string | null
  xeroSyncedAt: string | null
  provisionalInvoices: number
  mbasNeedingAction: number
  totals: unknown
  rows: unknown
}

/** 07:00 to 07:59 Sydney on the 2nd. Vercel runs the cron at 20:00 and 21:00 UTC on the 1st (AEDT and AEST). */
export function isTrueUpRunWindow(now: Date): boolean {
  const c = getSydneyWallClock(now)
  return c.day === 2 && c.hour === 7
}

async function defaultAlreadySent(asOfMonth: string): Promise<boolean> {
  const rows = rowsOf<{ n: number }>(
    await getDb().execute(sql`
      SELECT count(*)::int AS n FROM true_up_runs
      WHERE source = 'cron' AND as_of_month = ${`${asOfMonth}-01`}::date AND emailed_at IS NOT NULL
    `),
  )
  return Number(rows[0]?.n ?? 0) > 0
}

async function defaultSaveRun(row: TrueUpRunInsert): Promise<number> {
  const rows = rowsOf<{ id: number }>(
    await getDb().execute(sql`
      INSERT INTO true_up_runs (
        as_of_month, from_month, source, created_by, created_by_name, xero_synced_at,
        provisional_invoices, mbas_needing_action, totals, rows
      ) VALUES (
        ${`${row.asOfMonth}-01`}::date, ${`${row.fromMonth}-01`}::date, ${row.source},
        ${row.createdBy}, ${row.createdByName}, ${row.xeroSyncedAt}::timestamptz,
        ${row.provisionalInvoices}, ${row.mbasNeedingAction},
        ${JSON.stringify(row.totals)}::jsonb, ${JSON.stringify(row.rows)}::jsonb
      )
      RETURNING id
    `),
  )
  const id = Number(rows[0]?.id)
  if (!Number.isFinite(id)) throw new Error("true_up_runs insert returned no id")
  return id
}

async function defaultMarkEmailed(runId: number): Promise<void> {
  await getDb().execute(sql`UPDATE true_up_runs SET emailed_at = now() WHERE id = ${runId}`)
}

export async function runTrueUpMonthly(args: {
  now?: Date
  source: TrueUpRunSource
  /** Cron only: skip the Sydney window check. */
  force?: boolean
  /** Manual only: the as-of month (YYYY-MM). Default the month just ended. */
  asOfMonth?: string
  actor?: { teamMemberId: number; name: string | null } | null
  io?: TrueUpRunIo
}): Promise<TrueUpRunResult> {
  const now = args.now ?? new Date()
  const io = args.io ?? {}
  if (!(await isTrueUpEnabled()) || (args.source === "cron" && !(await isTrueUpCronEnabled()))) {
    return { ok: true, skipped: "disabled" }
  }
  if (!(await (io.migrationApplied ?? isTrueUpMigrationApplied)())) return { ok: true, skipped: "not_ready" }
  if (args.source === "cron" && !args.force && !isTrueUpRunWindow(now)) {
    return { ok: true, skipped: "outside_window" }
  }
  const months = trueUpRunMonths(now, args.source === "manual" ? args.asOfMonth : undefined)
  if (args.source === "cron" && (await (io.alreadySent ?? defaultAlreadySent)(months.asOfMonth))) {
    return { ok: true, skipped: "already_sent", asOfMonth: months.asOfMonth }
  }
  const report = await (io.load ?? loadTrueUp)(months)
  const runId = await (io.saveRun ?? defaultSaveRun)({
    ...months,
    source: args.source,
    createdBy: args.actor?.teamMemberId ?? null,
    createdByName: args.actor?.name ?? null,
    xeroSyncedAt: report.xeroSyncedAt,
    provisionalInvoices: report.provisionalInvoices,
    mbasNeedingAction: report.totals.mbasNeedingAction,
    totals: report.totals,
    rows: compactRunRows(report),
  })
  const base = (io.appBaseUrl ?? process.env.APP_BASE_URL ?? "").trim().replace(/\/$/, "")
  const email = buildTrueUpRunEmail(report, { appBaseUrl: base, source: args.source })
  try {
    await (io.send ?? sendHtmlEmail)({ to: io.recipients ?? getOpsEmailRecipients(), subject: email.subject, html: email.html })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[true-up-run] email failed", { runId, message })
    return {
      ok: true,
      status: "saved_not_emailed",
      runId,
      ...months,
      mbasNeedingAction: report.totals.mbasNeedingAction,
      emailError: message,
    }
  }
  await (io.markEmailed ?? defaultMarkEmailed)(runId)
  return { ok: true, status: "sent", runId, ...months, mbasNeedingAction: report.totals.mbasNeedingAction }
}
