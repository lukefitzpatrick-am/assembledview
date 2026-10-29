/**
 * publishBillingRevision (design 5.3, option a). Behind BILLING_REVISIONS.
 *
 * Cuts v(N+1) from the published tip vN in ONE transaction:
 * copies the version row, line_items, delivery schedule_months, the fee
 * snapshot, billing_overrides, campaign_kpi, campaign_reads and
 * pacing_scenarios (Q9) verbatim, writes the revised billing rows and blob,
 * upserts manual billing_overrides for each changed line, stamps
 * published_at, moves the master pointer, and computes a fresh
 * snapshot_checksum. Nothing on vN changes.
 *
 * It does NOT recompute billing from bursts (savePlanVersion does), so fee
 * rates and ad serving can never drift. It does not use the MB-2 carry.
 *
 * INVARIANTS: this is the second writer allowed to stamp published_at
 * (Luke, 26 Oct 2026, Q1). See docs/brain/INVARIANTS.md.
 */
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { getDb, schema, type Db } from "@/db"
import { computeSnapshotChecksum } from "@/lib/docs/snapshotChecksum"
import type { ApprovedSlice } from "@/lib/finance/approvedSlice"
import { applyRevisionToBillingBlob } from "@/lib/finance/revisions/applyRevisionToBillingBlob"
import {
  buildRevisionInput,
  loadRevisionContext,
  mediaRecordIdsByMonth,
  RevisionContextError,
  type AaLineIdsLoader,
  type RevisionContext,
} from "@/lib/finance/revisions/loadRevisionContext"
import { assertBillingRevisionsReady, BillingRevisionsNotReadyError, type MarkerReader } from "@/lib/finance/revisions/marker"
import { planBillingRevision } from "@/lib/finance/revisions/planBillingRevision"
import {
  buildRevisedBillingRows,
  diffCentsMaps,
  financeEditDrafts,
  overrideMonthsFor,
  overrideSumViolations,
  restoreTargetFrom,
  reviseApprovedSlice,
  revisionDiffPayload,
  rowCentsMap,
  subtractCentsMaps,
} from "@/lib/finance/revisions/revisionWriteModel"
import type { RevisionFail, RevisionOk, RevisionOptions, RevisionRequest } from "@/lib/finance/revisions/types"
import { normalisePublishedByEmail } from "@/lib/mediaplan/versionPublication"
import { rowsOf } from "@/lib/xero/dbRows"
import { explodeScheduleToMonthRows } from "@/scripts/migration/_scheduleTransform"

export type Tx = PostgresJsDatabase<typeof schema>

export type BillingRevisionWriteCode =
  | "NOT_READY"
  | "NOT_FOUND"
  | "NOT_PUBLISHED"
  | "STALE_BASE_VERSION"
  | "PREVIEW_STALE"
  | "PARTIAL_MBA_UNSUPPORTED"
  | "PLAN_REFUSED"
  | "BLOB_UNSUPPORTED"
  | "ROUND_TRIP_MISMATCH"
  | "OVERRIDE_SUM_VIOLATION"
  | "RESTORE_TARGET_NOT_FOUND"

export class BillingRevisionWriteError extends Error {
  constructor(
    readonly code: BillingRevisionWriteCode,
    message: string,
    readonly status: number,
    readonly detail: { plan?: RevisionOk | RevisionFail; keys?: string[] } = {},
  ) {
    super(message)
    this.name = "BillingRevisionWriteError"
  }
}

export type RevisionActor = {
  teamMemberId: number
  name: string | null
  email: string | null
}

export type PublishBillingRevisionInput = {
  mbaNumber: string
  baseVersionId: number
  expectedHash: string
  request: RevisionRequest
  options: RevisionOptions
  reason: string
  source: "ui" | "ava"
  actor: RevisionActor
  restoresRevisionId?: number | null
  now?: Date
  /** Test seams. */
  markerReader?: MarkerReader
  aaLineIds?: AaLineIdsLoader
  afterCommit?: (r: { newVersionId: number; mbaNumber: string }) => Promise<void>
  /**
   * Runs inside the publish transaction after the billing_revisions row is
   * written (the true-up ledger). A throw rolls the whole revision back.
   */
  inTransaction?: (tx: Tx, r: { revisionId: number; newVersionId: number; mbaNumber: string; plan: RevisionOk }) => Promise<void>
}

export type PublishBillingRevisionResult =
  | {
      status: "published"
      revisionId: number
      mbaNumber: string
      baseVersionNumber: number
      newVersionId: number
      newVersionNumber: number
      plan: RevisionOk
      warnings: string[]
    }
  | {
      status: "noted"
      revisionId: number
      mbaNumber: string
      baseVersionNumber: number
      plan: RevisionOk
      warnings: string[]
    }

function dollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

async function insertRevisionRow(
  tx: Tx,
  ctx: RevisionContext,
  input: PublishBillingRevisionInput,
  plan: RevisionOk,
  newVersion: { id: number; versionNumber: number } | null,
): Promise<number> {
  const rows = rowsOf<{ id: number | string }>(
    await tx.execute(sql`
      INSERT INTO billing_revisions (
        master_id, mba_number, base_version_id, base_version_number,
        new_version_id, new_version_number, mode, params, reason, moved_cents,
        diff, result_hash, source, created_by, created_by_name,
        restores_revision_id, status
      ) VALUES (
        ${ctx.masterId}, ${ctx.mbaNumber}, ${ctx.base.id}, ${ctx.base.versionNumber},
        ${newVersion?.id ?? null}, ${newVersion?.versionNumber ?? null}, ${input.request.mode},
        ${JSON.stringify({ request: input.request, options: input.options })}::jsonb,
        ${input.reason.trim()}, ${plan.movedCents},
        ${JSON.stringify({ ...revisionDiffPayload(plan), restore: restoreTargetFrom(ctx.lines, plan) })}::jsonb,
        ${plan.hash}, ${input.source}, ${input.actor.teamMemberId}, ${input.actor.name},
        ${input.restoresRevisionId ?? null}, ${newVersion ? "applied" : "noted"}
      ) RETURNING id
    `),
  )
  return Number(rows[0]!.id)
}

async function notify(tx: Tx, payload: Record<string, unknown>): Promise<void> {
  await tx.execute(sql`
    INSERT INTO app_notifications (audience, kind, payload)
    VALUES ('admin', 'billing_revision', ${JSON.stringify(payload)}::jsonb)
  `)
}

export async function publishBillingRevision(
  input: PublishBillingRevisionInput,
  db: Db = getDb(),
): Promise<PublishBillingRevisionResult> {
  try {
    await assertBillingRevisionsReady(input.markerReader)
  } catch (err) {
    if (err instanceof BillingRevisionsNotReadyError) {
      throw new BillingRevisionWriteError("NOT_READY", err.message, 409)
    }
    throw err
  }
  if (!input.reason || !input.reason.trim()) {
    throw new BillingRevisionWriteError("PLAN_REFUSED", "A reason is required.", 400)
  }
  const now = input.now ?? new Date()

  const result = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx

    // 1. Lock the master, rebuild the context from the tip.
    let ctx: RevisionContext
    try {
      ctx = await loadRevisionContext(tx, {
        mbaNumber: input.mbaNumber,
        now,
        lockMaster: true,
        aaLineIds: input.aaLineIds,
      })
    } catch (err) {
      if (err instanceof RevisionContextError) {
        throw new BillingRevisionWriteError(err.code, err.message, 404)
      }
      throw err
    }
    if (ctx.base.id !== input.baseVersionId) {
      throw new BillingRevisionWriteError(
        "STALE_BASE_VERSION",
        `The published version changed since the preview (now v${ctx.base.versionNumber}). Preview again.`,
        409,
      )
    }
    if (ctx.partial) {
      throw new BillingRevisionWriteError(
        "PARTIAL_MBA_UNSUPPORTED",
        "This plan has a partial MBA scope. Billing revisions do not support partial MBAs yet.",
        409,
      )
    }

    // 2. Rerun the plan. The hash must match the preview.
    const plan = planBillingRevision(buildRevisionInput(ctx, input.request, input.options))
    if (!plan.ok) {
      throw new BillingRevisionWriteError("PLAN_REFUSED", plan.message, 409, { plan })
    }
    if (plan.hash !== input.expectedHash) {
      throw new BillingRevisionWriteError(
        "PREVIEW_STALE",
        "The plan or its invoices changed since the preview. Here is a fresh preview.",
        409,
        { plan },
      )
    }

    const warnings = plan.warnings.map((w) => w.message)
    if (ctx.unmatchedLineIds.length > 0) {
      warnings.push(`Schedule rows with no plan line were left as they are: ${ctx.unmatchedLineIds.join(", ")}.`)
    }

    // Credit-only underspend (Q5): a change-log note, no version.
    if (plan.afterCells.length === 0) {
      const revisionId = await insertRevisionRow(tx, ctx, input, plan, null)
      await notify(tx, {
        mba: ctx.mbaNumber,
        revisionId,
        mode: input.request.mode,
        credits: plan.credits,
        by: input.actor.name,
      })
      return {
        status: "noted" as const,
        revisionId,
        mbaNumber: ctx.mbaNumber,
        baseVersionNumber: ctx.base.versionNumber,
        plan,
        warnings,
      }
    }

    // 3. Next version number: max + 1 (same rule as resolveVersionNumberForSave).
    const [tip] = await tx
      .select({ maxVn: sql<number>`coalesce(max(${schema.mediaPlanVersions.versionNumber}), 0)` })
      .from(schema.mediaPlanVersions)
      .where(eq(schema.mediaPlanVersions.masterId, ctx.masterId))
    const newVn = Number(tip?.maxVn ?? 0) + 1

    // 4. Blob and rows, with the round trip check.
    const baseBlob = ctx.base.legacySchedules?.billingSchedule
    const blob = applyRevisionToBillingBlob(baseBlob, plan.afterCells)
    if (!blob.ok) throw new BillingRevisionWriteError("BLOB_UNSUPPORTED", blob.message, 409)
    const revisedRows = buildRevisedBillingRows(ctx.billingRows, plan.afterCells)
    const explodedNew = explodeScheduleToMonthRows(0, "billing", blob.blob)
    const explodedBase = explodeScheduleToMonthRows(0, "billing", baseBlob)
    if (explodedNew.failureReason || explodedBase.failureReason) {
      throw new BillingRevisionWriteError(
        "ROUND_TRIP_MISMATCH",
        `The billing schedule could not be read back: ${explodedNew.failureReason ?? explodedBase.failureReason}`,
        409,
      )
    }
    const baseRowsMap = rowCentsMap(ctx.billingRows)
    const newRowsMap = rowCentsMap(revisedRows)
    const baseConsistent = diffCentsMaps(rowCentsMap(explodedBase.rows), baseRowsMap).length === 0
    const mismatch = baseConsistent
      ? diffCentsMaps(rowCentsMap(explodedNew.rows), newRowsMap)
      : diffCentsMaps(
          subtractCentsMaps(rowCentsMap(explodedNew.rows), rowCentsMap(explodedBase.rows)),
          subtractCentsMaps(newRowsMap, baseRowsMap),
        )
    if (mismatch.length > 0) {
      throw new BillingRevisionWriteError(
        "ROUND_TRIP_MISMATCH",
        "The rebuilt billing schedule does not match the planned rows. Nothing was written.",
        409,
        { keys: mismatch.slice(0, 20) },
      )
    }
    if (!baseConsistent) {
      warnings.push("The base version's blob and schedule rows already differed. Only the revised cells were checked.")
    }

    // 5. Override months and the C2 sum law.
    // A true-up stamps its overrides 'true_up' (the full reset guard reads it); its undo goes back to 'billing_revision'.
    // Ad serving has no billing_overrides row: attachOverridesToLineInputs reads
    // every non-fee row as media, so an ad serving row would land on the media.
    // Ad serving lives in the blob (adServingMonthlyAmounts) and schedule_months.
    const overrideReason = input.request.mode === "true_up" ? "true_up" : "billing_revision"
    const changedIds = new Set(plan.afterCells.map((c) => c.lineItemId))
    const overrideWrites: Array<{ lineItemId: string; component: "media" | "fee"; months: ReturnType<typeof overrideMonthsFor> }> = []
    const sumChecks: Parameters<typeof overrideSumViolations>[0] = []
    for (const c of plan.afterCells) {
      const base = ctx.lines.find((l) => l.lineItemId === c.lineItemId)!
      if (c.mediaChanged) {
        const months = overrideMonthsFor(base.media, c.media)
        overrideWrites.push({ lineItemId: c.lineItemId, component: "media", months })
        sumChecks.push({
          lineItemId: c.lineItemId,
          component: "media",
          months,
          expectedCents: Object.values(base.media).reduce((s, v) => s + v, 0),
        })
      }
      if (c.feeChanged) {
        const months = overrideMonthsFor(base.fee, c.fee)
        overrideWrites.push({ lineItemId: c.lineItemId, component: "fee", months })
        sumChecks.push({
          lineItemId: c.lineItemId,
          component: "fee",
          months,
          expectedCents: Object.values(base.fee).reduce((s, v) => s + v, 0),
        })
      }
      if (c.adservingChanged) {
        sumChecks.push({
          lineItemId: c.lineItemId,
          component: "adserving",
          months: overrideMonthsFor(base.adserving, c.adserving ?? {}),
          expectedCents: Object.values(base.adserving).reduce((s, v) => s + v, 0),
        })
      }
    }
    const violations = overrideSumViolations(sumChecks)
    if (violations.length > 0) {
      throw new BillingRevisionWriteError("OVERRIDE_SUM_VIOLATION", violations.join("\n"), 409)
    }

    const slice = reviseApprovedSlice(ctx.base.approvedSlice, revisedRows, changedIds)
    const legacySchedules = { ...(ctx.base.legacySchedules ?? {}), billingSchedule: blob.blob }

    // 6. Version row: copy of the base, new blob, document files cleared.
    const inserted = rowsOf<{ id: number | string }>(
      await tx.execute(sql`
        INSERT INTO media_plan_versions (
          master_id, version_number, mba_number, campaign_name, campaign_status,
          campaign_start_date, campaign_end_date, brand, client_contact, po_number,
          campaign_budget_cents, fixed_fee, channel_flags, legacy_schedules,
          approved_slice, mba_scope, mi_resolution,
          media_plan_file, mba_pdf_file, aa_media_plan_file,
          snapshot_checksum, published_at, published_by
        )
        SELECT
          master_id, ${newVn}, mba_number, campaign_name, campaign_status,
          campaign_start_date, campaign_end_date, brand, client_contact, po_number,
          campaign_budget_cents, fixed_fee, channel_flags, ${JSON.stringify(legacySchedules)}::jsonb,
          ${slice == null ? null : JSON.stringify(slice)}::jsonb, mba_scope, mi_resolution,
          NULL, NULL, NULL,
          NULL, NULL, NULL
        FROM media_plan_versions WHERE id = ${ctx.base.id}
        RETURNING id
      `),
    )
    const newVersionId = Number(inserted[0]!.id)

    // 7. line_items verbatim.
    await tx.execute(sql`
      INSERT INTO line_items (
        version_id, channel, line_item_id, position, market, buying_demo, buy_type,
        publisher, platform, bid_strategy, fixed_cost_media, client_pays_for_media,
        budget_includes_fees, no_adserving, bursts, attrs
      )
      SELECT ${newVersionId}, channel, line_item_id, position, market, buying_demo, buy_type,
        publisher, platform, bid_strategy, fixed_cost_media, client_pays_for_media,
        budget_includes_fees, no_adserving, bursts, attrs
      FROM line_items WHERE version_id = ${ctx.base.id}
    `)

    // 8. Delivery rows verbatim; billing rows from the plan.
    await tx.execute(sql`
      INSERT INTO schedule_months (version_id, line_item_id, component, basis, month, amount_cents, source)
      SELECT ${newVersionId}, line_item_id, component, basis, month, amount_cents, source
      FROM schedule_months WHERE version_id = ${ctx.base.id} AND basis = 'delivery'
    `)
    if (revisedRows.length > 0) {
      await tx.insert(schema.scheduleMonths).values(
        revisedRows.map((r) => ({
          versionId: newVersionId,
          lineItemId: r.lineItemId,
          component: r.component,
          basis: "billing" as const,
          month: r.month,
          amountCents: r.amountCents,
          source: r.source,
        })),
      )
    }

    // 9. Fee snapshot and billing_overrides (copy, then upsert changed lines).
    await tx.execute(sql`
      INSERT INTO mba_fee_snapshots (version_id, fees)
      SELECT ${newVersionId}, fees FROM mba_fee_snapshots WHERE version_id = ${ctx.base.id}
    `)
    await tx.execute(sql`
      INSERT INTO billing_overrides (version_id, line_item_id, component, mode, reason, months, date_basis)
      SELECT ${newVersionId}, line_item_id, component, mode, reason, months, date_basis
      FROM billing_overrides WHERE version_id = ${ctx.base.id}
    `)
    for (const w of overrideWrites) {
      await tx
        .insert(schema.billingOverrides)
        .values({
          versionId: newVersionId,
          lineItemId: w.lineItemId,
          component: w.component,
          mode: "manual",
          reason: overrideReason,
          months: w.months,
        })
        .onConflictDoUpdate({
          target: [schema.billingOverrides.versionId, schema.billingOverrides.lineItemId, schema.billingOverrides.component],
          set: { mode: "manual", reason: overrideReason, months: w.months },
        })
    }

    // 10. Version-keyed extras (Q9): KPIs, campaign reads, pacing scenarios.
    await tx.execute(sql`
      INSERT INTO campaign_kpi (
        mp_client_name, mba_number, version_number, campaign_name, media_type, publisher,
        bid_strategy, ctr, cpv, conversion_rate, vtr, frequency, line_item_id, target_source, benchmark_ref
      )
      SELECT mp_client_name, mba_number, ${newVn}, campaign_name, media_type, publisher,
        bid_strategy, ctr, cpv, conversion_rate, vtr, frequency, line_item_id, target_source, benchmark_ref
      FROM campaign_kpi
      WHERE lower(mba_number) = lower(${ctx.mbaNumber}) AND version_number = ${ctx.base.versionNumber}
    `)
    await tx.execute(sql`
      INSERT INTO campaign_reads (
        mba_number, version_number, status, beats, body_markdown, sources, generated_at,
        generated_by_email, edited_at, edited_by_email, published_at, published_by_email, error_message
      )
      SELECT mba_number, ${newVn}, status, beats, body_markdown, sources, generated_at,
        generated_by_email, edited_at, edited_by_email, published_at, published_by_email, error_message
      FROM campaign_reads
      WHERE lower(mba_number) = lower(${ctx.mbaNumber}) AND version_number = ${ctx.base.versionNumber}
        AND status IN ('draft', 'published')
    `)
    await tx.execute(sql`
      INSERT INTO pacing_scenarios (mba_number, version_number, name, levers, result, created_by_email, created_at)
      SELECT mba_number, ${newVn}, name, levers, result, created_by_email, created_at
      FROM pacing_scenarios
      WHERE lower(mba_number) = lower(${ctx.mbaNumber}) AND version_number = ${ctx.base.versionNumber}
    `)
    if (ctx.base.approvedSlice == null) {
      await tx.execute(sql`
        INSERT INTO mba_line_approvals (mba_number, media_plan_version, line_item_id, media_type, approved, approved_in_version)
        SELECT mba_number, ${newVn}, line_item_id, media_type, approved, approved_in_version
        FROM mba_line_approvals
        WHERE lower(mba_number) = lower(${ctx.mbaNumber}) AND media_plan_version = ${ctx.base.versionNumber}
      `)
    }

    // 11. Publish: stamp, then move the pointer (VP-1 checks at commit).
    await tx
      .update(schema.mediaPlanVersions)
      .set({
        createdAt: sql`now()`,
        publishedAt: sql`now()`,
        publishedBy: normalisePublishedByEmail(input.actor.email),
      })
      .where(eq(schema.mediaPlanVersions.id, newVersionId))
    await tx
      .update(schema.mediaPlanMasters)
      .set({ publishedVersionId: newVersionId })
      .where(eq(schema.mediaPlanMasters.id, ctx.masterId))

    // 12. snapshot_checksum over the new rows, slice and fee snapshot.
    const allRows = await tx
      .select({
        lineItemId: schema.scheduleMonths.lineItemId,
        component: schema.scheduleMonths.component,
        basis: schema.scheduleMonths.basis,
        month: schema.scheduleMonths.month,
        amountCents: schema.scheduleMonths.amountCents,
        source: schema.scheduleMonths.source,
      })
      .from(schema.scheduleMonths)
      .where(eq(schema.scheduleMonths.versionId, newVersionId))
    const [feeRow] = await tx
      .select({ fees: schema.mbaFeeSnapshots.fees })
      .from(schema.mbaFeeSnapshots)
      .where(eq(schema.mbaFeeSnapshots.versionId, newVersionId))
      .limit(1)
    const checksum = computeSnapshotChecksum({
      scheduleMonths: allRows.map((r) => ({
        lineItemId: r.lineItemId,
        component: r.component,
        basis: r.basis,
        month: String(r.month).slice(0, 10),
        amountCents: Number(r.amountCents) || 0,
        source: String(r.source ?? "computed"),
      })),
      approvedSlice: slice as ApprovedSlice | null,
      feeSnapshot: feeRow?.fees ?? null,
    })
    await tx
      .update(schema.mediaPlanVersions)
      .set({ snapshotChecksum: checksum })
      .where(and(eq(schema.mediaPlanVersions.id, newVersionId), eq(schema.mediaPlanVersions.masterId, ctx.masterId)))

    // 13. Audit: billing_revisions, finance_edits per changed month, notification.
    const revisionId = await insertRevisionRow(tx, ctx, input, plan, { id: newVersionId, versionNumber: newVn })
    if (input.restoresRevisionId != null) {
      await tx.execute(sql`
        UPDATE billing_revisions SET status = 'restored'
        WHERE id = ${input.restoresRevisionId} AND master_id = ${ctx.masterId} AND status = 'applied'
      `)
    }
    const recordIds = mediaRecordIdsByMonth(ctx)
    const edits = financeEditDrafts(plan)
    if (edits.length > 0) {
      await tx.insert(schema.financeEdits).values(
        edits.map((e) => ({
          financeBillingRecordsId: recordIds.get(e.month) ?? null,
          financeBillingLineItemsId: null,
          editType: "amount_change",
          fieldName: `${e.month}::${e.component}`,
          oldValue: dollars(e.oldCents),
          newValue: dollars(e.newCents),
          editStatus: "published",
          editedBy: input.actor.teamMemberId,
          editedByName: input.actor.name ?? "",
          publishedAt: sql`now()` as unknown as string,
          recordType: "billing_revision",
        })),
      )
    }
    if (input.inTransaction) {
      await input.inTransaction(tx, { revisionId, newVersionId, mbaNumber: ctx.mbaNumber, plan })
    }
    await notify(tx, {
      mba: ctx.mbaNumber,
      revisionId,
      mode: input.request.mode,
      fromVersion: ctx.base.versionNumber,
      toVersion: newVn,
      movedCents: plan.movedCents,
      by: input.actor.name,
      source: input.source,
    })

    return {
      status: "published" as const,
      revisionId,
      mbaNumber: ctx.mbaNumber,
      baseVersionNumber: ctx.base.versionNumber,
      newVersionId,
      newVersionNumber: newVn,
      plan,
      warnings,
    }
  })

  if (result.status === "published") {
    const after =
      input.afterCommit ??
      (async ({ newVersionId, mbaNumber }) => {
        try {
          const { markRunItemsStaleOnPublish } = await import("@/lib/finance/periods/markStaleOnPublish")
          await markRunItemsStaleOnPublish({ mbaNumber, versionId: newVersionId })
        } catch (err) {
          console.warn("[billing-revisions] PC5 stale flip failed", err)
        }
        try {
          const { runPublishDocumentsBestEffort } = await import("@/lib/docs/publishDocumentsAfterCommit")
          await runPublishDocumentsBestEffort({ published: true, versionId: newVersionId })
        } catch (err) {
          console.warn("[billing-revisions] documents after publish failed", err)
        }
      })
    await after({ newVersionId: result.newVersionId, mbaNumber: result.mbaNumber })
  }
  return result
}
