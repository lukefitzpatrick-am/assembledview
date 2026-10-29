/**
 * Billing revisions service: preview, apply from a signed token, list,
 * undo, and the panel context. Shared by the finance routes and the Ava
 * tools. Server only. Behind BILLING_REVISIONS and the 0106 marker.
 */
import "server-only"

import { desc, eq, sql } from "drizzle-orm"

import { getDb, schema, type Db } from "@/db"
import {
  BillingRevisionWriteError,
  publishBillingRevision,
  type PublishBillingRevisionInput,
  type PublishBillingRevisionResult,
  type RevisionActor,
} from "@/lib/data/publishBillingRevision"
import { formatAUD } from "@/lib/format/money"

import { isBillingRevisionsEnabled } from "./flag"
import {
  buildRevisionInput,
  loadRevisionContext,
  RevisionContextError,
  type RevisionContext,
  type RevisionExec,
} from "./loadRevisionContext"
import { isBillingRevisionsMigrationApplied } from "./marker"
import { loadPacingSpendHints } from "./pacingHint"
import { planBillingRevision } from "./planBillingRevision"
import { PREVIEW_TOKEN_MESSAGES, signPreviewToken, verifyPreviewToken } from "./previewToken"
import { currentSydneyMonth } from "./resolveMonthLocks"
import {
  isTrueUpRevisionMode,
  type MonthKey,
  type RevisionFail,
  type RevisionOk,
  type RevisionOptions,
  type RevisionRequest,
  type RestoreTarget,
} from "./types"

export type ServiceError = {
  ok: false
  status: number
  code: string
  message: string
  plan?: RevisionFail
}

export type PreviewOk = {
  ok: true
  mbaNumber: string
  baseVersionId: number
  baseVersionNumber: number
  newVersionNumber: number | null
  plan: RevisionOk
  impacts: string[]
  previewToken: string
  expiresAt: string
  restoresRevisionId: number | null
}

export type PreviewOutcome = PreviewOk | ServiceError

function err(status: number, code: string, message: string, extra: Partial<ServiceError> = {}): ServiceError {
  return { ok: false, status, code, message, ...extra }
}

/** Flag and marker, in that order. 404 when off so the feature is invisible. */
export async function billingRevisionsGate(): Promise<ServiceError | null> {
  if (!isBillingRevisionsEnabled()) return err(404, "NOT_FOUND", "Not found")
  if (!(await isBillingRevisionsMigrationApplied())) {
    return err(409, "NOT_READY", "Billing revisions need migration 0106")
  }
  return null
}

function monthLabel(m: MonthKey): string {
  const [y, mm] = m.split("-")
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${names[Number(mm) - 1]} ${y}`
}

export function revisionImpacts(ctx: RevisionContext, plan: RevisionOk, newVersionNumber: number | null): string[] {
  const out: string[] = []
  for (const m of plan.months) {
    if (m.total.before === m.total.after) continue
    if (m.lock.reasons.includes("approved")) {
      out.push(
        `${monthLabel(m.month)} is approved at ${formatAUD(m.total.before / 100)}. It will show "changed since" and need Re-approve.`,
      )
    }
  }
  if (plan.afterCells.length === 0) {
    out.push("No new version. The credit is noted in the change log only. Nothing goes to Xero.")
  } else {
    out.push(
      `Publishes v${newVersionNumber ?? ctx.base.versionNumber + 1} and a new MBA PDF (kept on file, no client re-sign).`,
    )
  }
  if (ctx.hasAaLines && plan.afterCells.length > 0) {
    out.push(`The plan has AA lines. The AA due list will show the new version as amended.`)
  }
  if (ctx.workingDraftCount > 0) {
    out.push(
      `${ctx.workingDraftCount} working draft${ctx.workingDraftCount === 1 ? "" : "s"} on this plan will be out of date. This does not block the change.`,
    )
  }
  return out
}

async function nextVersionNumber(exec: RevisionExec, masterId: number): Promise<number> {
  const [row] = await exec
    .select({ maxVn: sql<number>`coalesce(max(${schema.mediaPlanVersions.versionNumber}), 0)` })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))
  return Number(row?.maxVn ?? 0) + 1
}

export async function previewRevision(args: {
  mbaNumber: string
  request: RevisionRequest
  options: RevisionOptions
  reason: string
  source: "ui" | "ava"
  sub: string
  restoresRevisionId?: number | null
  now?: Date
  db?: Db
}): Promise<PreviewOutcome> {
  const db = args.db ?? getDb()
  const now = args.now ?? new Date()
  let ctx: RevisionContext
  try {
    ctx = await loadRevisionContext(db as unknown as RevisionExec, { mbaNumber: args.mbaNumber, now })
  } catch (e) {
    if (e instanceof RevisionContextError) return err(404, e.code, e.message)
    throw e
  }
  if (ctx.partial) {
    return err(409, "PARTIAL_MBA_UNSUPPORTED", "This plan has a partial MBA scope. Billing revisions do not support partial MBAs yet.")
  }
  const plan = planBillingRevision(buildRevisionInput(ctx, args.request, args.options))
  if (!plan.ok) return err(422, plan.code, plan.message, { plan })
  const newVersionNumber =
    plan.afterCells.length > 0 ? await nextVersionNumber(db as unknown as RevisionExec, ctx.masterId) : null
  const signed = signPreviewToken(
    {
      mbaNumber: ctx.mbaNumber,
      baseVersionId: ctx.base.id,
      hash: plan.hash,
      request: args.request,
      options: args.options,
      reason: args.reason,
      source: args.source,
      restoresRevisionId: args.restoresRevisionId ?? null,
      sub: args.sub,
    },
    now,
  )
  if ("error" in signed) return err(503, signed.error, PREVIEW_TOKEN_MESSAGES[signed.error])
  return {
    ok: true,
    mbaNumber: ctx.mbaNumber,
    baseVersionId: ctx.base.id,
    baseVersionNumber: ctx.base.versionNumber,
    newVersionNumber,
    plan,
    impacts: revisionImpacts(ctx, plan, newVersionNumber),
    previewToken: signed.token,
    expiresAt: signed.expiresAt,
    restoresRevisionId: args.restoresRevisionId ?? null,
  }
}

export type ApplyOutcome =
  | { ok: true; result: PublishBillingRevisionResult }
  | (ServiceError & { freshPreview?: PreviewOk })

export async function applyRevisionFromToken(args: {
  token: unknown
  sub: string
  actor: RevisionActor
  now?: Date
  db?: Db
  /** Only the true-up service applies true-up tokens (it writes the true-up ledger too). */
  allowTrueUp?: boolean
  /** Runs inside the publish transaction (the true-up ledger). */
  inTransaction?: PublishBillingRevisionInput["inTransaction"]
  /** Checks the verified token before anything is written (the true-up stale check). */
  beforeApply?: (payload: { mbaNumber: string; request: RevisionRequest }) => Promise<ServiceError | null>
}): Promise<ApplyOutcome> {
  const verified = verifyPreviewToken(args.token, { sub: args.sub, now: args.now })
  if (!verified.ok) {
    const status = verified.error === "TOKEN_SECRET_MISSING" ? 503 : verified.error === "TOKEN_OTHER_USER" ? 403 : 400
    return err(status, verified.error, PREVIEW_TOKEN_MESSAGES[verified.error])
  }
  const p = verified.payload
  if (isTrueUpRevisionMode(p.request?.mode) !== (args.allowTrueUp === true)) {
    return err(
      400,
      "TOKEN_WRONG_KIND",
      args.allowTrueUp ? "This preview is not a true-up. Preview again." : "Apply a true-up from the True-up page.",
    )
  }
  if (args.beforeApply) {
    const refused = await args.beforeApply({ mbaNumber: p.mbaNumber, request: p.request })
    if (refused) return refused
  }
  try {
    const result = await publishBillingRevision(
      {
        mbaNumber: p.mbaNumber,
        baseVersionId: p.baseVersionId,
        expectedHash: p.hash,
        request: p.request,
        options: p.options,
        reason: p.reason,
        source: p.source,
        actor: args.actor,
        restoresRevisionId: p.restoresRevisionId,
        now: args.now,
        inTransaction: args.inTransaction,
      },
      args.db ?? getDb(),
    )
    return { ok: true, result }
  } catch (e) {
    if (!(e instanceof BillingRevisionWriteError)) throw e
    const out: ServiceError & { freshPreview?: PreviewOk } = err(e.status, e.code, e.message)
    if (e.code === "PREVIEW_STALE" || e.code === "STALE_BASE_VERSION") {
      const fresh = await previewRevision({
        mbaNumber: p.mbaNumber,
        request: p.request,
        options: p.options,
        reason: p.reason,
        source: p.source,
        sub: args.sub,
        restoresRevisionId: p.restoresRevisionId,
        now: args.now,
        db: args.db,
      })
      if (fresh.ok) out.freshPreview = fresh
      else if (fresh.plan) out.plan = fresh.plan
    } else if (e.detail.plan && !e.detail.plan.ok) {
      out.plan = e.detail.plan
    }
    return out
  }
}

export type RevisionLogRow = {
  id: number
  createdAt: string
  mbaNumber: string
  mode: string
  reason: string
  source: string
  status: string
  createdByName: string | null
  baseVersionNumber: number
  newVersionNumber: number | null
  movedCents: number
  restoresRevisionId: number | null
  diff: unknown
}

export async function listRevisions(mbaNumber: string, db: Db = getDb()): Promise<RevisionLogRow[]> {
  const rows = await db
    .select()
    .from(schema.billingRevisions)
    .where(sql`lower(${schema.billingRevisions.mbaNumber}) = lower(${mbaNumber})`)
    .orderBy(desc(schema.billingRevisions.createdAt))
    .limit(100)
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    mbaNumber: r.mbaNumber,
    mode: r.mode,
    reason: r.reason,
    source: r.source,
    status: r.status,
    createdByName: r.createdByName,
    baseVersionNumber: r.baseVersionNumber,
    newVersionNumber: r.newVersionNumber,
    movedCents: Number(r.movedCents),
    restoresRevisionId: r.restoresRevisionId,
    diff: r.diff,
  }))
}

/**
 * Undo = a restore preview built from the stored revision. Only the
 * revision whose version is still the published tip can be undone, so an
 * undo never reverses a later change by accident.
 */
export async function previewUndo(args: {
  revisionId: number
  sub: string
  source: "ui" | "ava"
  reason?: string
  now?: Date
  db?: Db
}): Promise<PreviewOutcome> {
  const db = args.db ?? getDb()
  const [row] = await db
    .select()
    .from(schema.billingRevisions)
    .where(eq(schema.billingRevisions.id, args.revisionId))
    .limit(1)
  if (!row) return err(404, "NOT_FOUND", "No such billing revision.")
  if (row.status !== "applied" || row.newVersionId == null) {
    return err(409, "NOT_UNDOABLE", row.status === "noted" ? "A credit note has nothing to undo." : "This revision is already undone.")
  }
  if (isTrueUpRevisionMode(row.mode)) {
    return err(409, "NOT_UNDOABLE", "Undo a true-up from the True-up page.")
  }
  const [master] = await db
    .select({ publishedVersionId: schema.mediaPlanMasters.publishedVersionId })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, row.masterId))
    .limit(1)
  if (master?.publishedVersionId !== row.newVersionId) {
    return err(
      409,
      "UNDO_NOT_TIP",
      `A later version replaced v${row.newVersionNumber}. Undo the later change first, or make a new change.`,
    )
  }
  const diff = (row.diff ?? {}) as { restore?: RestoreTarget }
  const target = diff.restore
  if (!target || typeof target !== "object" || !target.media) {
    return err(409, "NOT_UNDOABLE", "This revision has no undo data.")
  }
  const params = (row.params ?? {}) as { options?: RevisionOptions }
  const options: RevisionOptions = {
    unlockApprovedMonths: params.options?.unlockApprovedMonths ?? [],
    includeProduction: params.options?.includeProduction === true,
    feeMode: "keep",
    adservingMode: "keep",
  }
  return previewRevision({
    mbaNumber: row.mbaNumber,
    request: { mode: "restore", target },
    options,
    reason: args.reason?.trim() || `Undo billing revision #${row.id} (v${row.newVersionNumber})`,
    source: args.source,
    sub: args.sub,
    restoresRevisionId: row.id,
    now: args.now,
    db,
  })
}

export type PanelContext = {
  ok: true
  mbaNumber: string
  baseVersionNumber: number
  currentMonth: MonthKey
  campaignStartMonth: MonthKey | null
  campaignEndMonth: MonthKey | null
  months: Array<{ month: MonthKey; level: string; reasons: string[]; past: boolean; mediaCents: number }>
  approvedMonths: MonthKey[]
  lines: Array<{
    lineItemId: string
    label: string
    isProduction: boolean
    clientPaysForMedia: boolean
    media: Record<MonthKey, number>
  }>
  workingDraftCount: number
  partial: boolean
  /** Q6: pacing delivered spend (cents) for the underspend month, where available. */
  pacingHints: Record<string, number>
}

export async function loadPanelContext(args: {
  mbaNumber: string
  underspendMonth?: string | null
  now?: Date
  db?: Db
}): Promise<PanelContext | ServiceError> {
  const db = args.db ?? getDb()
  let ctx: RevisionContext
  try {
    ctx = await loadRevisionContext(db as unknown as RevisionExec, { mbaNumber: args.mbaNumber, now: args.now ?? new Date() })
  } catch (e) {
    if (e instanceof RevisionContextError) return err(404, e.code, e.message)
    throw e
  }
  const underspend = args.underspendMonth && /^\d{4}-\d{2}$/.test(args.underspendMonth) ? args.underspendMonth : null
  const pacingHints = underspend
    ? await loadPacingSpendHints(
        ctx.lines.filter((l) => !l.clientPaysForMedia && (l.media[underspend] ?? 0) > 0).map((l) => l.lineItemId),
        underspend,
      )
    : {}
  return {
    ok: true,
    mbaNumber: ctx.mbaNumber,
    baseVersionNumber: ctx.base.versionNumber,
    currentMonth: ctx.currentMonth,
    campaignStartMonth: ctx.campaignStartMonth,
    campaignEndMonth: ctx.campaignEndMonth,
    months: ctx.locks.map((l) => ({
      month: l.month,
      level: l.level,
      reasons: l.reasons,
      past: l.past,
      mediaCents: ctx.lines
        .filter((x) => !x.clientPaysForMedia && !x.isProduction)
        .reduce((s, x) => s + (x.media[l.month] ?? 0), 0),
    })),
    approvedMonths: ctx.locks.filter((l) => l.level === "soft").map((l) => l.month),
    lines: ctx.lines.map((l) => ({
      lineItemId: l.lineItemId,
      label: l.label,
      isProduction: l.isProduction,
      clientPaysForMedia: l.clientPaysForMedia,
      media: l.media,
    })),
    workingDraftCount: ctx.workingDraftCount,
    partial: ctx.partial,
    pacingHints,
  }
}

export function currentRevisionMonth(now: Date = new Date()): MonthKey {
  return currentSydneyMonth(now)
}
