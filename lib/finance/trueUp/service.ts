/**
 * True-up fixes (Stage 2). Server only. Behind TRUE_UP_ACTIONS, migrations
 * 0106 and 0109, and BILLING_REVISION_TOKEN_SECRET.
 *
 * - A schedule fix is a billing revision of kind true_up: preview (signed
 *   token), confirm, ledger rows in the same transaction, undo.
 * - Explained, one-off and credit-note entries are ledger rows only. They
 *   never change a schedule.
 * - Invoice links and the client billing timing feed the report.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { getDb, type Db } from "@/db"
import type { RevisionActor } from "@/lib/data/publishBillingRevision"
import { isBillingRevisionsMigrationApplied } from "@/lib/finance/revisions/marker"
import {
  applyRevisionFromToken,
  previewRevision,
  type PreviewOk,
  type ServiceError,
} from "@/lib/finance/revisions/revisionService"
import { currentSydneyMonth } from "@/lib/finance/revisions/resolveMonthLocks"
import type { RestoreTarget, RevisionOptions, TrueUpRequest } from "@/lib/finance/revisions/types"
import { rowsOf } from "@/lib/xero/dbRows"

import {
  TRUE_UP_COMPONENTS,
  TRUE_UP_COMPONENT_LABELS,
  TRUE_UP_THRESHOLD_CENTS,
  financialYearStart,
  isTrueUpMonth,
  mbaKey,
  type TrueUpComponent,
  type TrueUpMbaRow,
  type TrueUpReport,
} from "./compute"
import { buildTrueUpFixRequest, sameTrueUpActuals, trueUpLedgerDrafts, type TrueUpFixChoice } from "./fixRequest"
import { TRUE_UP_NOT_READY_MESSAGE, isTrueUpActionsEnabled } from "./flag"
import { loadTrueUp } from "./load"
import { isTrueUpMigrationApplied } from "./marker"

export type TrueUpServiceError = ServiceError

function err(status: number, code: string, message: string, extra: Partial<ServiceError> = {}): ServiceError {
  return { ok: false, status, code, message, ...extra }
}

const FIX_OPTIONS: RevisionOptions = {
  unlockApprovedMonths: [],
  includeProduction: true,
  feeMode: "keep",
  adservingMode: "keep",
}

/** Flag, then 0109, then 0106. 404 while off so the actions are invisible. */
export async function trueUpActionsGate(): Promise<ServiceError | null> {
  if (!isTrueUpActionsEnabled()) return err(404, "NOT_FOUND", "Not found")
  if (!(await isTrueUpMigrationApplied())) return err(409, "NOT_READY", TRUE_UP_NOT_READY_MESSAGE)
  if (!(await isBillingRevisionsMigrationApplied())) {
    return err(409, "NOT_READY", "True-up fixes need migration 0106 (billing revisions).")
  }
  return null
}

function monthLabel(m: string): string {
  const d = new Date(`${m}-01T00:00:00Z`)
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" })
}

async function reportRow(
  mbaNumber: string,
  asOfMonth: string,
  fromMonth: string,
  load: typeof loadTrueUp = loadTrueUp,
): Promise<{ report: TrueUpReport; row: TrueUpMbaRow } | ServiceError> {
  const report = await load({ asOfMonth, fromMonth })
  const row = report.rows.find((r) => mbaKey(r.mbaNumber) === mbaKey(mbaNumber))
  if (!row) return err(404, "NOT_FOUND", `${mbaNumber} has nothing to true up to ${monthLabel(asOfMonth)}.`)
  return { report, row }
}

function reasonFor(request: TrueUpRequest): string {
  const comps = request.components.map((c) => TRUE_UP_COMPONENT_LABELS[c].toLowerCase()).join(", ")
  const months = Object.keys(request.actuals).sort()
  const span = months.length > 1 ? `${monthLabel(months[0]!)} to ${monthLabel(months[months.length - 1]!)}` : monthLabel(months[0]!)
  return `True-up ${comps} to Xero, ${span} (${request.strategy})`
}

export type TrueUpFixPreview = PreviewOk & {
  request: TrueUpRequest
  row: Pick<TrueUpMbaRow, "mbaNumber" | "clientName" | "campaignName" | "versionNumber">
}

export async function previewTrueUpFix(args: {
  mbaNumber: string
  asOfMonth: string
  fromMonth?: string
  choice: TrueUpFixChoice
  sub: string
  now?: Date
  db?: Db
  load?: typeof loadTrueUp
}): Promise<TrueUpFixPreview | ServiceError> {
  if (!isTrueUpMonth(args.asOfMonth)) return err(400, "BAD_MONTH", "asOf must be YYYY-MM.")
  const fromMonth = args.fromMonth ?? financialYearStart(args.asOfMonth)
  if (!isTrueUpMonth(fromMonth) || fromMonth > args.asOfMonth) return err(400, "BAD_MONTH", "from must be YYYY-MM, on or before asOf.")
  const now = args.now ?? new Date()
  const found = await reportRow(args.mbaNumber, args.asOfMonth, fromMonth, args.load)
  if ("ok" in found) return found
  const built = buildTrueUpFixRequest({
    row: found.row,
    asOfMonth: args.asOfMonth,
    fromMonth,
    currentMonth: currentSydneyMonth(now),
    choice: args.choice,
  })
  if (!built.ok) return err(422, "TRUE_UP_BAD_REQUEST", built.message)
  const out = await previewRevision({
    mbaNumber: found.row.mbaNumber,
    request: built.request,
    options: FIX_OPTIONS,
    reason: reasonFor(built.request),
    source: "ui",
    sub: args.sub,
    now,
    db: args.db,
  })
  if (!out.ok) return out
  return {
    ...out,
    request: built.request,
    row: {
      mbaNumber: found.row.mbaNumber,
      clientName: found.row.clientName,
      campaignName: found.row.campaignName,
      versionNumber: found.row.versionNumber,
    },
  }
}

type LedgerTx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }

async function insertLedgerRow(
  tx: LedgerTx,
  row: {
    runId?: number | null
    mbaNumber: string
    component: TrueUpComponent
    action: "schedule" | "explained" | "one_off" | "credit_note"
    strategy: string | null
    months: string[]
    asOfMonth: string
    gapCents: number
    amountCents: number
    billingRevisionId: number | null
    reasonCode: string | null
    note: string | null
    xeroInvoiceId: string | null
    actor: RevisionActor
    previewHash: string | null
  },
): Promise<number> {
  const months = `{${row.months.map((m) => `"${m.replace(/[^0-9-]/g, "")}"`).join(",")}}`
  const res = rowsOf<{ id: number | string }>(
    await tx.execute(sql`
      INSERT INTO true_up_actions (
        run_id, mba_number, component, action, strategy, months, as_of_month,
        gap_cents, amount_cents, billing_revision_id, reason_code, note, xero_invoice_id,
        status, created_by, created_by_name, preview_hash
      ) VALUES (
        ${row.runId ?? null}, ${row.mbaNumber}, ${row.component}, ${row.action}, ${row.strategy},
        ${months}::text[], ${`${row.asOfMonth}-01`}::date,
        ${row.gapCents}, ${row.amountCents}, ${row.billingRevisionId}, ${row.reasonCode}, ${row.note},
        ${row.xeroInvoiceId}, 'applied', ${row.actor.teamMemberId}, ${row.actor.name}, ${row.previewHash}
      ) RETURNING id
    `),
  )
  return Number(res[0]!.id)
}

export type TrueUpApplyResult =
  | {
      ok: true
      kind: "true_up" | "true_up_restore"
      revisionId: number
      mbaNumber: string
      newVersionNumber: number | null
      ledgerIds: number[]
      warnings: string[]
    }
  | (ServiceError & { freshPreview?: PreviewOk })

/**
 * Confirm a fix or an undo from its preview token. A fix first rebuilds the
 * report and refuses (PREVIEW_STALE) when what was invoiced changed since the
 * preview. Ledger rows are written in the publish transaction.
 */
export async function applyTrueUpFromToken(args: {
  token: unknown
  sub: string
  actor: RevisionActor
  runId?: number | null
  now?: Date
  db?: Db
  load?: typeof loadTrueUp
}): Promise<TrueUpApplyResult> {
  const now = args.now ?? new Date()
  const ledgerIds: number[] = []
  let kind: "true_up" | "true_up_restore" = "true_up"
  let restoresRevisionId: number | null = null
  const out = await applyRevisionFromToken({
    token: args.token,
    sub: args.sub,
    actor: args.actor,
    now,
    db: args.db,
    allowTrueUp: true,
    beforeApply: async ({ mbaNumber, request }) => {
      if (request.mode !== "true_up") {
        kind = "true_up_restore"
        return null
      }
      const fromMonth = request.fromMonth ?? financialYearStart(request.asOfMonth)
      const found = await reportRow(mbaNumber, request.asOfMonth, fromMonth, args.load)
      if ("ok" in found) return found
      const rebuilt = buildTrueUpFixRequest({
        row: found.row,
        asOfMonth: request.asOfMonth,
        fromMonth,
        currentMonth: currentSydneyMonth(now),
        choice: { components: request.components, strategy: request.strategy, noInvoiceMonths: request.noInvoiceMonths },
      })
      if (!rebuilt.ok || !sameTrueUpActuals(rebuilt.request, request)) {
        return err(409, "PREVIEW_STALE", "Xero invoices for this plan changed since the preview. Preview again.")
      }
      return null
    },
    inTransaction: async (tx, r) => {
      if (kind === "true_up_restore") {
        const rows = rowsOf<{ id: number | string }>(
          await tx.execute(sql`
            SELECT restores_revision_id AS id FROM billing_revisions WHERE id = ${r.revisionId}
          `),
        )
        restoresRevisionId = rows[0]?.id == null ? null : Number(rows[0].id)
        if (restoresRevisionId != null) {
          await tx.execute(sql`
            UPDATE true_up_actions
               SET status = 'undone', undone_at = now(), undone_by = ${args.actor.teamMemberId}
             WHERE billing_revision_id = ${restoresRevisionId} AND status = 'applied'
          `)
        }
        return
      }
      const params = rowsOf<{ params: { request?: TrueUpRequest } | null }>(
        await tx.execute(sql`SELECT params FROM billing_revisions WHERE id = ${r.revisionId}`),
      )
      const request = params[0]?.params?.request
      if (!request || request.mode !== "true_up") throw new Error("true-up revision row has no true_up request")
      for (const d of trueUpLedgerDrafts({ mbaNumber: r.mbaNumber, request, plan: r.plan })) {
        ledgerIds.push(
          await insertLedgerRow(tx as unknown as LedgerTx, {
            runId: args.runId ?? null,
            mbaNumber: d.mbaNumber,
            component: d.component,
            action: d.action,
            strategy: d.strategy,
            months: d.months,
            asOfMonth: d.asOfMonth,
            gapCents: d.gapCents,
            amountCents: d.amountCents,
            billingRevisionId: r.revisionId,
            reasonCode: null,
            note: d.note,
            xeroInvoiceId: null,
            actor: args.actor,
            previewHash: r.plan.hash,
          }),
        )
      }
    },
  })
  if (!out.ok) return out
  const res = out.result
  return {
    ok: true,
    kind,
    revisionId: res.revisionId,
    mbaNumber: res.mbaNumber,
    newVersionNumber: res.status === "published" ? res.newVersionNumber : null,
    ledgerIds,
    warnings: res.warnings,
  }
}

/**
 * Undo preview for a confirmed schedule fix (by any of its ledger rows).
 * Only while the fix's version is still the published tip, and only while
 * every month that was open at the fix is still open (the planner checks).
 */
export async function previewTrueUpUndo(args: {
  actionId: number
  sub: string
  now?: Date
  db?: Db
}): Promise<PreviewOk | ServiceError> {
  const db = args.db ?? getDb()
  const actions = rowsOf<{ billing_revision_id: number | string | null; status: string; action: string }>(
    await db.execute(sql`SELECT billing_revision_id, status, action FROM true_up_actions WHERE id = ${args.actionId}`),
  )
  const a = actions[0]
  if (!a) return err(404, "NOT_FOUND", "No such true-up entry.")
  if (a.status !== "applied") return err(409, "NOT_UNDOABLE", "This true-up is already undone.")
  if (a.billing_revision_id == null) return err(409, "NOT_UNDOABLE", "This entry changed no schedule. Remove it instead.")
  const revisionId = Number(a.billing_revision_id)
  const revs = rowsOf<{
    id: number | string
    mba_number: string
    mode: string
    status: string
    new_version_id: number | string | null
    new_version_number: number | null
    created_at: string | Date
    diff: { restore?: RestoreTarget } | null
    master_id: number | string
  }>(
    await db.execute(sql`
      SELECT id, mba_number, mode, status, new_version_id, new_version_number, created_at, diff, master_id
      FROM billing_revisions WHERE id = ${revisionId}
    `),
  )
  const rev = revs[0]
  if (!rev || rev.mode !== "true_up") return err(404, "NOT_FOUND", "No true-up revision for this entry.")
  if (rev.status !== "applied" || rev.new_version_id == null) return err(409, "NOT_UNDOABLE", "This true-up is already undone.")
  const tip = rowsOf<{ published_version_id: number | string | null }>(
    await db.execute(sql`SELECT published_version_id FROM media_plan_masters WHERE id = ${rev.master_id}`),
  )
  if (Number(tip[0]?.published_version_id) !== Number(rev.new_version_id)) {
    return err(409, "UNDO_NOT_TIP", `A later version replaced v${rev.new_version_number}. Undo the later change first.`)
  }
  const target = rev.diff?.restore
  if (!target || typeof target !== "object") return err(409, "NOT_UNDOABLE", "This true-up has no undo data.")
  const fixedAtMonth = currentSydneyMonth(new Date(rev.created_at))
  return previewRevision({
    mbaNumber: rev.mba_number,
    request: { mode: "true_up_restore", target, fixedAtMonth },
    options: FIX_OPTIONS,
    reason: `Undo true-up #${revisionId} (v${rev.new_version_number})`,
    source: "ui",
    sub: args.sub,
    restoresRevisionId: Number(rev.id),
    now: args.now,
    db,
  })
}

const REASON_CODES = ["timing", "prebill", "client_agreed", "schedule_incomplete", "other"] as const
export type TrueUpReasonCode = (typeof REASON_CODES)[number]

export type TrueUpNoteInput = {
  mbaNumber: string
  component: TrueUpComponent
  action: "explained" | "one_off" | "credit_note"
  asOfMonth: string
  fromMonth?: string
  reasonCode?: string | null
  note?: string | null
  xeroInvoiceId?: string | null
}

/**
 * Explained, one-off to raise, or credit note: a ledger row, no schedule
 * change. The gap is read from the report on the server, never trusted from
 * the browser. Refused when the gap is under $1.
 */
export async function recordTrueUpNote(args: {
  input: TrueUpNoteInput
  actor: RevisionActor
  runId?: number | null
  db?: Db
  load?: typeof loadTrueUp
}): Promise<{ ok: true; id: number; gapCents: number } | ServiceError> {
  const i = args.input
  if (!TRUE_UP_COMPONENTS.includes(i.component)) return err(400, "BAD_REQUEST", "Unknown component.")
  if (!["explained", "one_off", "credit_note"].includes(i.action)) return err(400, "BAD_REQUEST", "Unknown action.")
  if (!isTrueUpMonth(i.asOfMonth)) return err(400, "BAD_MONTH", "asOf must be YYYY-MM.")
  const fromMonth = i.fromMonth ?? financialYearStart(i.asOfMonth)
  const reason = i.reasonCode ? String(i.reasonCode) : null
  const note = String(i.note ?? "").trim().slice(0, 1000) || null
  if (i.action === "explained") {
    if (!reason || !(REASON_CODES as readonly string[]).includes(reason)) {
      return err(400, "BAD_REQUEST", "Pick why the gap is explained.")
    }
    if (reason === "other" && !note) return err(400, "BAD_REQUEST", "Add a note when the reason is Other.")
  }
  const db = args.db ?? getDb()
  let invoiceId: string | null = null
  if (i.action === "credit_note") {
    invoiceId = String(i.xeroInvoiceId ?? "").trim() || null
    if (!invoiceId) return err(400, "BAD_REQUEST", "Pick the invoice the credit note is for.")
    const found = rowsOf<{ xero_invoice_id: string }>(
      await db.execute(sql`
        SELECT xero_invoice_id FROM xero_ar_invoices
        WHERE xero_invoice_id = ${invoiceId} OR upper(invoice_number) = upper(${invoiceId})
        LIMIT 1
      `),
    )
    if (!found[0]) return err(404, "NOT_FOUND", "No Xero invoice with that number.")
    invoiceId = found[0].xero_invoice_id
  }
  const found = await reportRow(i.mbaNumber, i.asOfMonth, fromMonth, args.load)
  if ("ok" in found) return found
  const gap = found.row.components[i.component].uncoveredGap
  if (Math.abs(gap) < TRUE_UP_THRESHOLD_CENTS) return err(409, "NO_GAP", "The gap is under $1. Nothing to record.")
  const id = await insertLedgerRow(db as unknown as LedgerTx, {
    runId: args.runId ?? null,
    mbaNumber: found.row.mbaNumber,
    component: i.component,
    action: i.action,
    strategy: null,
    months: [],
    asOfMonth: i.asOfMonth,
    gapCents: gap,
    amountCents: i.action === "explained" ? 0 : gap,
    billingRevisionId: null,
    reasonCode: i.action === "explained" ? reason : null,
    note,
    xeroInvoiceId: invoiceId,
    actor: args.actor,
    previewHash: null,
  })
  return { ok: true, id, gapCents: gap }
}

/** Remove an explained, one-off or credit-note entry (status undone). Schedule fixes undo through a preview. */
export async function undoTrueUpNote(args: { actionId: number; actor: RevisionActor; db?: Db }): Promise<{ ok: true } | ServiceError> {
  const db = args.db ?? getDb()
  const rows = rowsOf<{ id: number | string; action: string; status: string }>(
    await db.execute(sql`SELECT id, action, status FROM true_up_actions WHERE id = ${args.actionId}`),
  )
  const r = rows[0]
  if (!r) return err(404, "NOT_FOUND", "No such true-up entry.")
  if (r.action === "schedule") return err(409, "NOT_UNDOABLE", "Undo a schedule fix with Undo, which previews first.")
  if (r.status !== "applied") return err(409, "NOT_UNDOABLE", "This entry is already removed.")
  await db.execute(sql`
    UPDATE true_up_actions SET status = 'undone', undone_at = now(), undone_by = ${args.actor.teamMemberId}
    WHERE id = ${args.actionId} AND status = 'applied'
  `)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Invoice links and billing timing

export type TrueUpInvoiceLink = {
  id: number
  xeroInvoiceId: string
  invoiceNumber: string | null
  mbaNumber: string
  billingMonth: string | null
  note: string | null
  createdByName: string | null
}

export async function listTrueUpInvoiceLinks(db: Db = getDb()): Promise<TrueUpInvoiceLink[]> {
  const rows = rowsOf<{
    id: number | string
    xero_invoice_id: string
    invoice_number: string | null
    mba_number: string
    billing_month: string | null
    note: string | null
    created_by_name: string | null
  }>(
    await db.execute(sql`
      SELECT l.id, l.xero_invoice_id, i.invoice_number, l.mba_number,
             to_char(l.billing_month, 'YYYY-MM') AS billing_month, l.note, l.created_by_name
      FROM true_up_invoice_links l
      LEFT JOIN xero_ar_invoices i ON i.xero_invoice_id = l.xero_invoice_id
      ORDER BY l.created_at DESC
    `),
  )
  return rows.map((r) => ({
    id: Number(r.id),
    xeroInvoiceId: r.xero_invoice_id,
    invoiceNumber: r.invoice_number,
    mbaNumber: r.mba_number,
    billingMonth: r.billing_month,
    note: r.note,
    createdByName: r.created_by_name,
  }))
}

export async function addTrueUpInvoiceLink(args: {
  invoice: string
  mbaNumber: string
  billingMonth?: string | null
  note?: string | null
  actor: RevisionActor
  db?: Db
}): Promise<{ ok: true; id: number } | ServiceError> {
  const db = args.db ?? getDb()
  const invoice = String(args.invoice ?? "").trim()
  const mba = String(args.mbaNumber ?? "").trim()
  if (!invoice || !mba) return err(400, "BAD_REQUEST", "An invoice number and an MBA are required.")
  const month = args.billingMonth ? String(args.billingMonth).slice(0, 7) : null
  if (month && !isTrueUpMonth(month)) return err(400, "BAD_MONTH", "The billing month must be YYYY-MM.")
  const inv = rowsOf<{ xero_invoice_id: string }>(
    await db.execute(sql`
      SELECT xero_invoice_id FROM xero_ar_invoices
      WHERE xero_invoice_id = ${invoice} OR upper(invoice_number) = upper(${invoice})
      LIMIT 1
    `),
  )
  if (!inv[0]) return err(404, "NOT_FOUND", `No Xero invoice ${invoice}.`)
  const master = rowsOf<{ mba_number: string }>(
    await db.execute(sql`
      SELECT m.mba_number FROM media_plan_masters m
      WHERE lower(m.mba_number) = lower(${mba}) AND m.published_version_id IS NOT NULL
      LIMIT 1
    `),
  )
  if (!master[0]) return err(404, "NOT_FOUND", `No published plan ${mba}.`)
  const res = rowsOf<{ id: number | string }>(
    await db.execute(sql`
      INSERT INTO true_up_invoice_links (xero_invoice_id, mba_number, billing_month, note, created_by, created_by_name)
      VALUES (${inv[0].xero_invoice_id}, ${master[0].mba_number}, ${month ? `${month}-01` : null}::date,
              ${String(args.note ?? "").trim().slice(0, 500) || null}, ${args.actor.teamMemberId}, ${args.actor.name})
      ON CONFLICT (xero_invoice_id) DO UPDATE
        SET mba_number = EXCLUDED.mba_number, billing_month = EXCLUDED.billing_month, note = EXCLUDED.note,
            created_by = EXCLUDED.created_by, created_by_name = EXCLUDED.created_by_name, created_at = now()
      RETURNING id
    `),
  )
  return { ok: true, id: Number(res[0]!.id) }
}

export async function removeTrueUpInvoiceLink(args: { id: number; db?: Db }): Promise<{ ok: true } | ServiceError> {
  const db = args.db ?? getDb()
  const res = rowsOf<{ id: number | string }>(
    await db.execute(sql`DELETE FROM true_up_invoice_links WHERE id = ${args.id} RETURNING id`),
  )
  if (!res[0]) return err(404, "NOT_FOUND", "No such link.")
  return { ok: true }
}

export const BILLING_TIMINGS = ["same_month", "month_ahead", "in_arrears"] as const
export type BillingTimingValue = (typeof BILLING_TIMINGS)[number]

/** Decision 2: same month, month ahead or in arrears per client. Same month stores null. */
export async function setClientBillingTiming(args: {
  clientId: number
  timing: string
  actor: RevisionActor
  db?: Db
}): Promise<{ ok: true; timing: BillingTimingValue } | ServiceError> {
  if (!Number.isInteger(args.clientId) || args.clientId <= 0) return err(400, "BAD_REQUEST", "A client is required.")
  if (!(BILLING_TIMINGS as readonly string[]).includes(args.timing)) {
    return err(400, "BAD_REQUEST", "Billing timing is same_month, month_ahead or in_arrears.")
  }
  const db = args.db ?? getDb()
  const stored = args.timing === "same_month" ? null : args.timing
  const client = rowsOf<{ id: number | string }>(await db.execute(sql`SELECT id FROM clients WHERE id = ${args.clientId}`))
  if (!client[0]) return err(404, "NOT_FOUND", "No such client.")
  await db.execute(sql`
    INSERT INTO client_finance_owners (client_id, team_member_id, billing_timing, updated_at, updated_by, updated_by_name)
    VALUES (${args.clientId}, NULL, ${stored}, now(), ${args.actor.teamMemberId}, ${args.actor.name})
    ON CONFLICT (client_id) DO UPDATE
      SET billing_timing = EXCLUDED.billing_timing, updated_at = now(),
          updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name
  `)
  return { ok: true, timing: args.timing as BillingTimingValue }
}

export async function readClientBillingTimings(db: Db = getDb()): Promise<Record<string, BillingTimingValue>> {
  const rows = rowsOf<{ client_id: number | string; billing_timing: string | null }>(
    await db.execute(sql`SELECT client_id, billing_timing FROM client_finance_owners WHERE billing_timing IS NOT NULL`),
  )
  const out: Record<string, BillingTimingValue> = {}
  for (const r of rows) {
    if ((BILLING_TIMINGS as readonly string[]).includes(String(r.billing_timing))) {
      out[String(r.client_id)] = r.billing_timing as BillingTimingValue
    }
  }
  return out
}
