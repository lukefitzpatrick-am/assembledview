/**
 * T4a — one transactional media-plan save on Postgres (`DATABASE_URL`).
 *
 * Replaces the Xano 20-table fan-out with a single Drizzle transaction:
 * resolve versionId → (publish/new_version: copy billing_overrides from base
 * version — `baseVersionId` when sent, else version_number = newVn − 1)
 * → load billing_overrides → attachOverridesToLineInputs →
 * computeCampaignFinancials → replace-set line_items → explode schedule_months
 * → reconcileOverrideSources (source='override') → legacy_schedules mirror →
 * publish guards (BOSS006) + mba_fee_snapshots.
 *
 * Financials (and therefore the billing blob) are computed WITH overrides
 * attached so blob months and schedule_months agree. Delivery stays
 * override-free inside computeCampaignFinancials.
 *
 * MB-2: publish/new_version copies base-version overrides onto the new versionId
 * before the MB-22 payload replace-set and the override read that feeds
 * financials; deleted-line overrides are dropped and named in the response
 * (never silent).
 *
 * MB-22: for every line_item_id present in the save payload, billing_overrides
 * become exactly the payload's billingOverride/feeOverride (REPLACE-SET);
 * a payload line with no override deletes that line's rows. Scoped only to
 * line ids in the payload (partial MBA still emits every line).
 *
 * MB-25: REPLACE-SET runs only when `billingOverrides.authoritative === true`
 * (client loaded overrides successfully). Otherwise skip and leave DB rows
 * untouched. `clearedLineIds` deletes Reset-to-auto lines even after refetch.
 *
 * Gated by `WRITE_BACKEND=postgres`.
 */
import { and, count, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { getDb, schema, type Db } from "@/db"
import type { LineChannel } from "@/db/schema"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import {
  computeCampaignFinancials,
  resolveFeePctFromFeeLoading,
} from "@/lib/finance/computeCampaignFinancials"
import {
  evaluateAdServingZeroTripwire,
  lineAdServingTotalsFromSchedule,
  logAdServingZeroTripwire,
} from "@/lib/billing/adServingSaveTripwire"
import { computeApprovedSlice, type ApprovedSlice } from "@/lib/finance/approvedSlice"
import { computeSnapshotChecksum } from "@/lib/docs/snapshotChecksum"
import {
  evaluateFullScopeGate,
  getSaveGateFullScopeMode,
} from "@/lib/finance/fullScopeGate"
import type {
  BillingOverride,
  FeeLoading,
  FeeOverride,
  LineItemInput,
} from "@/lib/finance/campaignFinancials.types"
import {
  attachOverridesToLineInputs,
  type BillingOverrideRow,
} from "@/lib/finance/billingOverrides"
import {
  buildCanonicalBillingLineIdSet,
  canonicalBillingLineIdSetHas,
} from "@/lib/finance/manualBillingOverridesUi"
import {
  shouldReplaceBillingOverridesFromPayload,
  type BillingOverridesSaveEnvelope,
} from "@/lib/finance/billingOverridesSaveIntent"
import { validateManualOverrideSumRules } from "@/lib/finance/recomputeBillingScheduleOnSave"
import type { BillingMonth } from "@/lib/billing/types"
import {
  evaluatePostgresAutoDivergence,
  type AutoBillingCorrectionSummary,
} from "@/lib/billing/postgresAutoBillingCorrection"
import {
  assertVersionMutable,
  VersionImmutableError,
} from "@/lib/mediaplan/assertVersionMutable"
import { normalisePublishedByEmail } from "@/lib/mediaplan/versionPublication"
import { classifySaveUniqueViolation } from "@/lib/data/classifySaveUniqueViolation"
import {
  explodeScheduleToMonthRows,
  type ScheduleMonthInsert,
} from "@/scripts/migration/_scheduleTransform"
import { toCents } from "@/scripts/migration/_shared"

export { classifySaveUniqueViolation } from "@/lib/data/classifySaveUniqueViolation"

type Schema = typeof schema
type Tx = PostgresJsDatabase<Schema>

export type SavePlanMode = "draft" | "new_version" | "publish"

export type SavePlanLineItem = {
  lineItemId: string
  channel: LineChannel
  position?: number | null
  market?: string | null
  buyingDemo?: string | null
  buyType?: string | null
  publisher?: string | null
  platform?: string | null
  bidStrategy?: string | null
  fixedCostMedia?: boolean | null
  clientPaysForMedia?: boolean | null
  budgetIncludesFees?: boolean | null
  noAdserving?: boolean | null
  bursts: unknown
  attrs?: Record<string, unknown> | null
  /** Compute path media type (may differ from channel enum, e.g. socialMedia). */
  mediaType: string
  rate: number
  enteredAmount: number
  feePct?: number
  approval?: "approved" | "excluded"
  label?: string
  billingOverride?: BillingOverride
  feeOverride?: FeeOverride
}

export type SavePlanVersionInput = {
  masterId: number
  mbaNumber: string
  versionNumber: number
  mode: SavePlanMode
  campaignName?: string | null
  campaignStatus?: string | null
  campaignStartDate?: string | null
  campaignEndDate?: string | null
  brand?: string | null
  clientContact?: string | null
  poNumber?: string | null
  campaignBudgetCents?: number | null
  fixedFee?: boolean | null
  channelFlags?: Record<string, unknown> | null
  mediaPlanFile?: unknown
  mbaPdfFile?: unknown
  aaMediaPlanFile?: unknown
  lineItems: SavePlanLineItem[]
  feeLoading: FeeLoading
  /** On publish — stored in mba_fee_snapshots.fees (defaults to feeLoading). */
  feeSnapshot?: Record<string, unknown>
  /**
   * VC Stage 1 — lowercased email of the publisher. Required for mode:'publish'
   * from the route (missing → stamp published_at, leave published_by null).
   */
  publishedByEmail?: string | null
  /**
   * Month chips at approve time (`January 2026` / `2026-01`). Empty → all
   * billing months in the approved slice.
   */
  selectedMonthYears?: readonly string[]
  getRateForMediaType?: (mediaType: string) => number
  adservaudio?: number
  /**
   * O4 — editor working billing snapshot for post-save correction toast.
   * AUTO drift vs server recompute never blocks; manual C2 still does.
   */
  clientBillingSchedulePreview?: BillingMonth[] | null
  /**
   * MB-25 — override REPLACE-SET intent. `authoritative: true` only when the
   * client successfully loaded billing_overrides. Missing / false → skip
   * REPLACE-SET (never delete on unknown).
   */
  billingOverrides?: BillingOverridesSaveEnvelope | null
  /**
   * Version this cut is forked from. Publish/new_version billing-override
   * carry reads this row (not the current tip) when set.
   */
  baseVersionId?: number | null
  /**
   * Test-only injection point for the PENFOLD016/BOSS006 kill-shot.
   * Must throw to abort between line_items and schedule_months writes.
   */
  _testHooks?: {
    afterLineItemsInsert?: () => void | Promise<void>
  }
}

/** Override rows dropped on publish/new_version because the line no longer exists. */
export type DroppedBillingOverride = {
  lineItemId: string
  component: "media" | "fee"
  reason?: string | null
}

export type SavePlanVersionResult = {
  versionId: number
  /** Version number actually written (server-resolved for publish/new_version). */
  versionNumber: number
  lineCount: number
  scheduleRowCount: number
  published: boolean
  /**
   * Server-computed billing/delivery blobs persisted on the version
   * (`legacy_schedules`). Required by the post-commit Xano mirror.
   */
  legacySchedules: {
    billingSchedule: unknown
    deliverySchedule: unknown
  }
  /** Present when AUTO lines in the client preview diverged from server recompute. */
  billingCorrection?: AutoBillingCorrectionSummary | null
  /**
   * MB-2 — overrides on the base tip whose line_item_id is absent from the new
   * version's line_items. Always named when non-empty; never silent-drop.
   */
  droppedBillingOverrides?: DroppedBillingOverride[]
}

export type SavePlanErrorCode =
  | "MISSING_LINE_ITEM_ID"
  | "DUPLICATE_LINE_ITEM_ID"
  | "VERSION_ALREADY_EXISTS"
  | "BOSS006_EMPTY_PUBLISH"
  | "SCHEDULE_EXPLODE_FAILED"
  | "MASTER_NOT_FOUND"
  | "UNIQUE_VIOLATION"
  | "C1_FULL_SCOPE"
  | "BILLING_OVERRIDE_SUM_VIOLATION"
  | "VERSION_PUBLISHED_IMMUTABLE"

export class SavePlanError extends Error {
  readonly code: SavePlanErrorCode
  readonly lineItemId?: string

  constructor(code: SavePlanErrorCode, message: string, lineItemId?: string) {
    super(message)
    this.name = "SavePlanError"
    this.code = code
    this.lineItemId = lineItemId
  }
}

function monthToDate(monthKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null
  return `${monthKey}-01`
}

function validateLineItemIds(lines: SavePlanLineItem[]): void {
  const seen = new Map<string, number>()
  for (let i = 0; i < lines.length; i++) {
    const id = String(lines[i]?.lineItemId ?? "").trim()
    if (!id) {
      throw new SavePlanError(
        "MISSING_LINE_ITEM_ID",
        `line_item_id is required (row index ${i}); client must supply stable ids — never regenerate on save`
      )
    }
    if (seen.has(id)) {
      throw new SavePlanError(
        "DUPLICATE_LINE_ITEM_ID",
        `Duplicate line_item_id "${id}" in save payload — aborting transaction`,
        id
      )
    }
    seen.set(id, i)
  }
}

function toLineItemInputs(lines: SavePlanLineItem[]): LineItemInput[] {
  return lines.map((l) => ({
    lineItemId: String(l.lineItemId).trim(),
    mediaType: l.mediaType,
    buyType: l.buyType ?? "cpc",
    rate: l.rate,
    enteredAmount: l.enteredAmount,
    budgetIncludesFees: Boolean(l.budgetIncludesFees),
    clientPaysForMedia: Boolean(l.clientPaysForMedia),
    noAdserving: l.noAdserving ?? undefined,
    feePct: l.feePct,
    bursts: (Array.isArray(l.bursts) ? l.bursts : []) as LineItemInput["bursts"],
    approval: l.approval ?? "approved",
    billingOverride: l.billingOverride,
    feeOverride: l.feeOverride,
    label: l.label,
  }))
}

type ScheduleRow = ScheduleMonthInsert

/**
 * Mark billing schedule months covered by `billing_overrides` as source='override',
 * using override amounts (schema: months jsonb → schedule_months.source='override').
 */
function reconcileOverrideSources(
  rows: ScheduleMonthInsert[],
  overrides: Array<{
    lineItemId: string
    component: "media" | "fee"
    months: unknown
  }>
): ScheduleRow[] {
  const out: ScheduleRow[] = rows.map((r) => ({ ...r, source: "computed" as const }))
  const index = new Map<string, number>()
  for (let i = 0; i < out.length; i++) {
    const r = out[i]!
    index.set(
      [r.versionId, r.lineItemId, r.component, r.basis, r.month].join("|"),
      i
    )
  }

  for (const ov of overrides) {
    const lineItemId = String(ov.lineItemId ?? "").trim()
    if (!lineItemId) continue
    const component = ov.component === "fee" ? "fee" : "media"
    let monthsRaw = ov.months
    if (typeof monthsRaw === "string") {
      try {
        monthsRaw = JSON.parse(monthsRaw)
      } catch {
        continue
      }
    }
    if (!Array.isArray(monthsRaw)) continue
    for (const entry of monthsRaw) {
      if (!entry || typeof entry !== "object") continue
      const monthLabel = String((entry as { month?: unknown }).month ?? "").trim()
      const monthKey = normalizeMonthKey(monthLabel)
      if (!monthKey) continue
      const monthDate = monthToDate(monthKey)
      if (!monthDate) continue
      const amountRaw = (entry as { amount?: unknown }).amount
      const amountNum =
        typeof amountRaw === "number"
          ? amountRaw
          : Number.parseFloat(String(amountRaw ?? "").replace(/[$,\s]/g, ""))
      if (!Number.isFinite(amountNum)) continue
      const amountCents = toCents(amountNum)
      const versionId = out[0]?.versionId ?? rows[0]?.versionId
      if (versionId == null) continue
      const key = [versionId, lineItemId, component, "billing", monthDate].join("|")
      const existingIdx = index.get(key)
      if (existingIdx != null) {
        out[existingIdx] = {
          ...out[existingIdx]!,
          amountCents,
          source: "override",
        }
      } else {
        const row: ScheduleRow = {
          versionId,
          lineItemId,
          component,
          basis: "billing",
          month: monthDate,
          amountCents,
          source: "override",
        }
        index.set(key, out.length)
        out.push(row)
      }
    }
  }
  return out
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: string; cause?: { code?: string }; message?: string }
  return (
    e.code === "23505" ||
    e.cause?.code === "23505" ||
    /unique|duplicate key/i.test(String(e.message ?? ""))
  )
}

/** FEE_SNAPSHOT_WRITE_ONCE=on|off — default off until Luke confirms audit §5.3. */
export function getFeeSnapshotWriteOnce(): boolean {
  return (process.env.FEE_SNAPSHOT_WRITE_ONCE ?? "off").trim().toLowerCase() === "on"
}

function approvedLineIdsFromInput(lines: SavePlanLineItem[]): string[] {
  return lines
    .filter((l) => (l.approval ?? "approved") !== "excluded")
    .map((l) => String(l.lineItemId).trim())
    .filter(Boolean)
}

function extractOffendingLineItemId(err: unknown, fallbackIds: string[]): string | undefined {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  for (const id of fallbackIds) {
    if (id && msg.includes(id)) return id
  }
  const m = msg.match(/line_item_id[^=]*=\(([^)]+)\)/i)
  return m?.[1]?.split(",")[1]?.trim() ?? m?.[1]?.trim()
}

/**
 * O4.6 — publish/new_version ignore the client number and take Postgres tip+1
 * inside the txn. Draft-overwrite keeps targeting the loaded version.
 */
async function resolveVersionNumberForSave(
  tx: Tx,
  input: Pick<SavePlanVersionInput, "masterId" | "mode" | "versionNumber">
): Promise<number> {
  if (input.mode === "draft") return input.versionNumber

  const [tip] = await tx
    .select({
      maxVn: sql<number>`coalesce(max(${schema.mediaPlanVersions.versionNumber}), 0)`,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, input.masterId))
  return Number(tip?.maxVn ?? 0) + 1
}

const BILLING_OVERRIDES_PUBLISH_CARRY_KIND = "billing_overrides_publish_carry"

type BaseOverrideRow = {
  lineItemId: string
  component: "media" | "fee" | "adserving"
  months: unknown
  mode: string | null
  reason: string | null
  dateBasis: string | null
}

/**
 * MB-2 — when publish/new_version inserts a new version row, copy billing_overrides
 * from the fork base (`baseVersionId` when sent; else version_number = newVn − 1)
 * for line_item_ids that still exist. Deleted-line overrides are returned as
 * `dropped` (never silent).
 *
 * TRANSITIONAL (VC-3): once Revisions land, the revision holds its own overrides
 * and Publish promotes them. At that point copying from the prior row becomes a
 * competing second source and this carry must go. Do not expand this path meanwhile.
 */
async function carryBillingOverridesToNewVersion(
  tx: Tx,
  args: {
    masterId: number
    newVersionId: number
    newVersionNumber: number
    livingLineItemIds: ReadonlySet<string>
    baseVersionId?: number | null
  }
): Promise<{
  carried: number
  dropped: DroppedBillingOverride[]
  fromVersionId: number | null
}> {
  if (args.newVersionNumber <= 1) {
    return { carried: 0, dropped: [], fromVersionId: null }
  }

  let base: { id: number } | undefined
  if (args.baseVersionId != null) {
    const [row] = await tx
      .select({ id: schema.mediaPlanVersions.id })
      .from(schema.mediaPlanVersions)
      .where(
        and(
          eq(schema.mediaPlanVersions.id, args.baseVersionId),
          eq(schema.mediaPlanVersions.masterId, args.masterId)
        )
      )
      .limit(1)
    base = row
  } else {
    const [row] = await tx
      .select({ id: schema.mediaPlanVersions.id })
      .from(schema.mediaPlanVersions)
      .where(
        and(
          eq(schema.mediaPlanVersions.masterId, args.masterId),
          eq(schema.mediaPlanVersions.versionNumber, args.newVersionNumber - 1)
        )
      )
      .limit(1)
    base = row
  }
  if (!base) {
    return { carried: 0, dropped: [], fromVersionId: null }
  }

  const baseRows: BaseOverrideRow[] = await tx
    .select({
      lineItemId: schema.billingOverrides.lineItemId,
      component: schema.billingOverrides.component,
      months: schema.billingOverrides.months,
      mode: schema.billingOverrides.mode,
      reason: schema.billingOverrides.reason,
      dateBasis: schema.billingOverrides.dateBasis,
    })
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, base.id))

  if (baseRows.length === 0) {
    return { carried: 0, dropped: [], fromVersionId: base.id }
  }

  const toCopy: BaseOverrideRow[] = []
  const dropped: DroppedBillingOverride[] = []
  for (const row of baseRows) {
    const lineItemId = String(row.lineItemId ?? "").trim()
    const component: "media" | "fee" =
      row.component === "fee" ? "fee" : "media"
    // MB-11: membership is canonical (bare ↔ billing-{media}::bare).
    if (!lineItemId || !canonicalBillingLineIdSetHas(args.livingLineItemIds, lineItemId)) {
      dropped.push({
        lineItemId: lineItemId || "(missing)",
        component,
        reason: row.reason,
      })
      continue
    }
    toCopy.push(row)
  }

  if (toCopy.length > 0) {
    await tx.insert(schema.billingOverrides).values(
      toCopy.map((r) => ({
        versionId: args.newVersionId,
        lineItemId: String(r.lineItemId).trim(),
        component: r.component === "fee" ? ("fee" as const) : ("media" as const),
        mode: r.mode ?? "manual",
        reason: r.reason,
        months: r.months,
        dateBasis: r.dateBasis,
      }))
    )
  }

  return { carried: toCopy.length, dropped, fromVersionId: base.id }
}

/**
 * MB-22 REPLACE-SET + MB-25 intent gate.
 * For each line id present in the payload, billing_overrides become exactly
 * the payload's billingOverride / feeOverride. A payload line with no override
 * deletes that line's rows. Scoped to payload line ids only (canonical match).
 * Additionally deletes every clearedLineIds entry (Reset-to-auto tombstone).
 */
async function replaceBillingOverridesFromPayload(
  tx: Tx,
  versionId: number,
  lineItems: SavePlanLineItem[],
  envelope: BillingOverridesSaveEnvelope | null | undefined
): Promise<"applied" | "skipped"> {
  if (!shouldReplaceBillingOverridesFromPayload(envelope)) {
    console.warn(
      "[savePlan] MB-25: skipping billing_overrides REPLACE-SET (authoritative≠true)",
      {
        versionId,
        authoritative: envelope?.authoritative ?? null,
        clearedLineIds: envelope?.clearedLineIds?.length ?? 0,
      }
    )
    return "skipped"
  }

  if (lineItems.length === 0 && !(envelope?.clearedLineIds?.length)) {
    return "applied"
  }

  const payloadCanon = buildCanonicalBillingLineIdSet([
    ...lineItems.map((l) => String(l.lineItemId ?? "")),
    ...(envelope?.clearedLineIds ?? []),
  ])

  const existing = await tx
    .select({
      id: schema.billingOverrides.id,
      lineItemId: schema.billingOverrides.lineItemId,
    })
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, versionId))

  const idsToDelete = existing
    .filter((r) =>
      canonicalBillingLineIdSetHas(payloadCanon, String(r.lineItemId ?? ""))
    )
    .map((r) => r.id)

  if (idsToDelete.length > 0) {
    await tx
      .delete(schema.billingOverrides)
      .where(inArray(schema.billingOverrides.id, idsToDelete))
  }

  const inserts: Array<{
    versionId: number
    lineItemId: string
    component: "media" | "fee"
    mode: string
    reason: string | null
    months: unknown
    dateBasis: string
  }> = []

  const clearedCanon = buildCanonicalBillingLineIdSet(
    envelope?.clearedLineIds ?? []
  )

  for (const line of lineItems) {
    const lineItemId = String(line.lineItemId ?? "").trim()
    if (!lineItemId) continue
    // Tombstoned lines stay deleted even if a stale override slipped onto the line.
    if (canonicalBillingLineIdSetHas(clearedCanon, lineItemId)) continue

    const media = line.billingOverride
    if (
      media?.mode === "manual" &&
      Array.isArray(media.months) &&
      media.months.length > 0
    ) {
      inserts.push({
        versionId,
        lineItemId,
        component: "media",
        mode: "manual",
        reason: media.reason ?? "manual",
        months: media.months,
        dateBasis: String(media.dateBasis ?? ""),
      })
    }

    const fee = line.feeOverride
    if (
      fee?.mode === "manual" &&
      Array.isArray(fee.months) &&
      fee.months.length > 0
    ) {
      inserts.push({
        versionId,
        lineItemId,
        component: "fee",
        mode: "manual",
        reason: fee.reason ?? "manual",
        months: fee.months,
        dateBasis: String(fee.dateBasis ?? ""),
      })
    }
  }

  if (inserts.length > 0) {
    await tx.insert(schema.billingOverrides).values(inserts)
  }
  return "applied"
}

async function upsertVersionRow(
  tx: Tx,
  input: SavePlanVersionInput,
  legacySchedules: unknown,
  versionNumber: number
): Promise<number> {
  const baseValues = {
    masterId: input.masterId,
    versionNumber,
    mbaNumber: input.mbaNumber,
    campaignName: input.campaignName ?? null,
    campaignStartDate: input.campaignStartDate ?? null,
    campaignEndDate: input.campaignEndDate ?? null,
    brand: input.brand ?? null,
    clientContact: input.clientContact ?? null,
    poNumber: input.poNumber ?? null,
    campaignBudgetCents: input.campaignBudgetCents ?? null,
    fixedFee: input.fixedFee ?? null,
    channelFlags: input.channelFlags ?? null,
    legacySchedules,
    mediaPlanFile: input.mediaPlanFile ?? null,
    mbaPdfFile: input.mbaPdfFile ?? null,
    aaMediaPlanFile: input.aaMediaPlanFile ?? null,
  }

  if (input.mode === "draft") {
    // Draft overwrite must NOT touch published_at / published_by — a re-save of
    // an already-published row must not clear or re-stamp publication.
    // VC Stage 2a: refuse the overwrite when published_at is set (P1-2 routes
    // around this path; do not change save-mode behaviour here).
    const existing = await tx
      .select({ id: schema.mediaPlanVersions.id })
      .from(schema.mediaPlanVersions)
      .where(
        and(
          eq(schema.mediaPlanVersions.masterId, input.masterId),
          eq(schema.mediaPlanVersions.versionNumber, versionNumber)
        )
      )
      .limit(1)
    if (existing[0]) {
      try {
        await assertVersionMutable(existing[0].id, tx)
      } catch (err) {
        if (err instanceof VersionImmutableError) {
          throw new SavePlanError("VERSION_PUBLISHED_IMMUTABLE", err.message)
        }
        throw err
      }
      await tx
        .update(schema.mediaPlanVersions)
        .set({
          campaignName: baseValues.campaignName,
          campaignStartDate: baseValues.campaignStartDate,
          campaignEndDate: baseValues.campaignEndDate,
          brand: baseValues.brand,
          clientContact: baseValues.clientContact,
          poNumber: baseValues.poNumber,
          campaignBudgetCents: baseValues.campaignBudgetCents,
          fixedFee: baseValues.fixedFee,
          channelFlags: baseValues.channelFlags,
          legacySchedules: baseValues.legacySchedules,
          mediaPlanFile: baseValues.mediaPlanFile,
          mbaPdfFile: baseValues.mbaPdfFile,
          aaMediaPlanFile: baseValues.aaMediaPlanFile,
        })
        .where(eq(schema.mediaPlanVersions.id, existing[0].id))
      return existing[0].id
    }
  }

  // Insert path: draft (first row) / publish / new_version.
  // VC Stage 1 asymmetry (intentional — do not "tidy"): only mode==='publish'
  // stamps published_at below. mode==='new_version' inserts without advancing the
  // publish tip, so the row stays unpublished (published_at null) by definition.
  const [masterStatus] = await tx
    .select({ campaignStatus: schema.mediaPlanMasters.campaignStatus })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, input.masterId))
    .limit(1)

  const [inserted] = await tx
    .insert(schema.mediaPlanVersions)
    .values({
      ...baseValues,
      // Historical snapshot of the master at cut time — not from the save payload.
      campaignStatus: masterStatus?.campaignStatus ?? null,
    })
    .returning({ id: schema.mediaPlanVersions.id })
  if (!inserted) {
    throw new Error("Failed to insert media_plan_versions row")
  }
  return inserted.id
}

/**
 * Single-transaction save. Callers must ensure `WRITE_BACKEND=postgres` at the
 * route boundary; this function always writes Postgres when invoked.
 */
export async function savePlanVersion(
  input: SavePlanVersionInput,
  db: Db = getDb()
): Promise<SavePlanVersionResult> {
  validateLineItemIds(input.lineItems)

  const [master] = await db
    .select({ id: schema.mediaPlanMasters.id })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, input.masterId))
    .limit(1)
  if (!master) {
    throw new SavePlanError(
      "MASTER_NOT_FOUND",
      `media_plan_masters id=${input.masterId} not found`
    )
  }

  const lineInputs = toLineItemInputs(input.lineItems)
  const feeLoading = input.feeLoading ?? {}

  const lineIds = input.lineItems.map((l) => String(l.lineItemId).trim())
  /** Captured for 23505 messaging — publish path may differ from client number. */
  let attemptedVersionNumber = input.versionNumber

  try {
    const result = await db.transaction(async (tx) => {
      // MB-1 order (one txn): resolve versionId → load overrides → attach →
      // compute financials → explode → reconcile. Publish tip+1 stays inside
      // the txn (resolveVersionNumberForSave) — no pre-txn version upsert.
      const versionNumber = await resolveVersionNumberForSave(tx as Tx, input)
      attemptedVersionNumber = versionNumber
      const versionId = await upsertVersionRow(
        tx as Tx,
        input,
        { billingSchedule: [], deliverySchedule: [] },
        versionNumber
      )

      // Replace-set line_items (atomic inside txn — readers never see the gap).
      await tx
        .delete(schema.lineItems)
        .where(eq(schema.lineItems.versionId, versionId))

      if (input.lineItems.length > 0) {
        await tx.insert(schema.lineItems).values(
          input.lineItems.map((l, position) => ({
            versionId,
            channel: l.channel,
            lineItemId: String(l.lineItemId).trim(),
            position: l.position ?? position,
            market: l.market ?? null,
            buyingDemo: l.buyingDemo ?? null,
            buyType: l.buyType ?? null,
            publisher: l.publisher ?? null,
            platform: l.platform ?? null,
            bidStrategy: l.bidStrategy ?? null,
            fixedCostMedia: l.fixedCostMedia ?? null,
            clientPaysForMedia: l.clientPaysForMedia ?? null,
            budgetIncludesFees: l.budgetIncludesFees ?? null,
            noAdserving: l.noAdserving ?? null,
            bursts: l.bursts ?? [],
            attrs: l.attrs ?? {},
          }))
        )
      }

      if (input._testHooks?.afterLineItemsInsert) {
        await input._testHooks.afterLineItemsInsert()
      }

      // MB-2: publish/new_version inserts a new version row — copy overrides
      // from the fork base (baseVersionId, else ordinal tip−1) BEFORE the
      // override read that feeds financials. Draft overwrite keeps the same
      // versionId (no copy).
      let droppedBillingOverrides: DroppedBillingOverride[] = []
      let carryAudit: {
        carried: number
        dropped: DroppedBillingOverride[]
        fromVersionId: number | null
      } | null = null
      if (input.mode === "publish" || input.mode === "new_version") {
        // MB-11: canonicalise living ids so decorated schedule ids match bare overrides.
        const livingIds = buildCanonicalBillingLineIdSet(
          input.lineItems.map((l) => String(l.lineItemId ?? ""))
        )
        carryAudit = await carryBillingOverridesToNewVersion(tx as Tx, {
          masterId: input.masterId,
          newVersionId: versionId,
          newVersionNumber: versionNumber,
          livingLineItemIds: livingIds,
          baseVersionId: input.baseVersionId ?? null,
        })
        droppedBillingOverrides = carryAudit.dropped
      }

      // MB-22/MB-25: payload REPLACE-SET when authoritative; otherwise leave DB
      // rows untouched (never delete on unknown/failed load).
      await replaceBillingOverridesFromPayload(
        tx as Tx,
        versionId,
        input.lineItems,
        input.billingOverrides
      )

      const overrideRows = await tx
        .select({
          lineItemId: schema.billingOverrides.lineItemId,
          component: schema.billingOverrides.component,
          months: schema.billingOverrides.months,
          mode: schema.billingOverrides.mode,
          reason: schema.billingOverrides.reason,
          dateBasis: schema.billingOverrides.dateBasis,
        })
        .from(schema.billingOverrides)
        .where(eq(schema.billingOverrides.versionId, versionId))

      const overrideRowsForAttach: BillingOverrideRow[] = overrideRows.map((r) => ({
        line_item_id: r.lineItemId,
        component: r.component === "fee" ? "fee" : "media",
        mode: r.mode ?? "manual",
        reason: r.reason,
        months: r.months as BillingOverrideRow["months"],
        date_basis: r.dateBasis,
      }))
      const lineItemsWithOverrides = attachOverridesToLineInputs(
        lineInputs,
        overrideRowsForAttach
      )

      // Billing schedule + blob from override-attached inputs; delivery months
      // remain burst-prorated (billingOverride does not touch delivery).
      const autoFinancials = computeCampaignFinancials(
        lineInputs.map((l) => ({
          ...l,
          billingOverride: undefined,
          feeOverride: undefined,
        })),
        { feeLoading },
        {
          getRateForMediaType: input.getRateForMediaType,
          adservaudio: input.adservaudio,
          selectedMonthYears: input.selectedMonthYears,
        }
      )
      const financials = computeCampaignFinancials(
        lineItemsWithOverrides,
        { feeLoading },
        {
          getRateForMediaType: input.getRateForMediaType,
          adservaudio: input.adservaudio,
          selectedMonthYears: input.selectedMonthYears,
        }
      )

      // O4.5 tripwire (always-on, never blocks): non-zero resolved feePct but $0 fee total.
      {
        const feeTotal = Number(financials.mbaScopeTotals?.fee ?? 0)
        if (Number.isFinite(feeTotal) && Math.abs(feeTotal) < 0.005) {
          const nonzeroPctLines: Array<{
            lineItemId: string
            mediaType: string
            feePct: number
          }> = []
          for (const line of lineInputs) {
            if (line.approval === "excluded") continue
            const feePct =
              typeof line.feePct === "number" && Number.isFinite(line.feePct)
                ? line.feePct
                : resolveFeePctFromFeeLoading(line.mediaType, feeLoading)
            if (feePct > 0 && (Number(line.enteredAmount) || 0) > 0) {
              nonzeroPctLines.push({
                lineItemId: String(line.lineItemId),
                mediaType: line.mediaType,
                feePct,
              })
            }
          }
          if (nonzeroPctLines.length > 0) {
            console.error("[savePlan-fee-zero]", {
              mba: input.mbaNumber,
              version: input.versionNumber,
              mode: input.mode,
              feeTotal,
              feeLoadingKeys: Object.keys(feeLoading),
              lines: nonzeroPctLines.slice(0, 12),
            })
          }
        }
      }

      // Ad-serving twin of O4.5 (always-on, never blocks): campaign-total $0
      // with eligible chargeable lines, OR partial — some eligible lines charge
      // and others unexpectedly stay $0.
      {
        const adServingTotal = Number(financials.mbaScopeTotals?.adServing ?? 0)
        const noAdservingByLineId = new Map(
          lineInputs.map(
            (l) => [String(l.lineItemId), Boolean(l.noAdserving)] as const
          )
        )
        const trip = evaluateAdServingZeroTripwire({
          adServingTotal,
          perLine: financials.perLine,
          noAdservingByLineId,
          lineAdServingById: lineAdServingTotalsFromSchedule(
            financials.billingSchedule
          ),
        })
        if (trip) {
          logAdServingZeroTripwire(trip, {
            mba: input.mbaNumber,
            version: input.versionNumber,
            mode: input.mode,
            hasResolver: typeof input.getRateForMediaType === "function",
            adservaudio: input.adservaudio ?? null,
          })
        }
      }

      // O4: never block on AUTO preview drift — server schedule is authoritative.
      let billingCorrection: AutoBillingCorrectionSummary | null = null
      const preview = input.clientBillingSchedulePreview
      if (Array.isArray(preview) && preview.length > 0) {
        const evaluated = evaluatePostgresAutoDivergence({
          working: preview,
          autoReference: financials.billingSchedule,
        })
        if (evaluated.autoOnly) {
          billingCorrection = evaluated.correction
        }
      }

      // O4 / MB-22 D2: blocking media+fee sum gate vs AUTO burst-derived totals.
      // PC4 collision worksheet is client-only — when months no longer sum after
      // a media-total change, block here with named lines (never copy blind).
      const sumViolations = validateManualOverrideSumRules({
        lineItems: lineItemsWithOverrides,
        autoFinancials,
      })
      if (sumViolations.length > 0) {
        throw new SavePlanError(
          "BILLING_OVERRIDE_SUM_VIOLATION",
          sumViolations.map((v) => v.message).join("\n")
        )
      }

      // MB-2 audit: one notification when a publish/new_version carried or dropped.
      if (
        carryAudit &&
        (carryAudit.carried > 0 || carryAudit.dropped.length > 0)
      ) {
        try {
          await tx.execute(sql`
            INSERT INTO app_notifications (audience, kind, payload)
            VALUES (
              ${"admin"},
              ${BILLING_OVERRIDES_PUBLISH_CARRY_KIND},
              ${JSON.stringify({
                mba: input.mbaNumber,
                mode: input.mode,
                fromVersionId: carryAudit.fromVersionId,
                toVersionId: versionId,
                toVersionNumber: versionNumber,
                carried: carryAudit.carried,
                dropped: carryAudit.dropped,
              })}::jsonb
            )
          `)
        } catch (auditErr) {
          console.warn("[MB-2] failed to persist billing_overrides carry audit", {
            mba: input.mbaNumber,
            versionId,
            err: auditErr,
          })
        }
      }

      const legacySchedules = {
        billingSchedule: financials.billingSchedule,
        deliverySchedule: financials.deliverySchedule,
      }

      const billingExplode = explodeScheduleToMonthRows(
        versionId,
        "billing",
        financials.billingSchedule
      )
      const deliveryExplode = explodeScheduleToMonthRows(
        versionId,
        "delivery",
        financials.deliverySchedule
      )
      if (billingExplode.failureReason || deliveryExplode.failureReason) {
        throw new SavePlanError(
          "SCHEDULE_EXPLODE_FAILED",
          [
            billingExplode.failureReason,
            deliveryExplode.failureReason,
          ]
            .filter(Boolean)
            .join("; ")
        )
      }

      // Belt-and-braces: stamp source='override' (amounts already match via compute).
      const scheduleRows = reconcileOverrideSources(
        [...billingExplode.rows, ...deliveryExplode.rows],
        overrideRows.map((r) => ({
          lineItemId: r.lineItemId,
          component: r.component === "fee" ? "fee" : "media",
          months: r.months,
        }))
      )

      await tx
        .delete(schema.scheduleMonths)
        .where(eq(schema.scheduleMonths.versionId, versionId))

      if (scheduleRows.length > 0) {
        await tx.insert(schema.scheduleMonths).values(
          scheduleRows.map((r) => ({
            versionId: r.versionId,
            lineItemId: r.lineItemId,
            component: r.component,
            basis: r.basis,
            month: r.month,
            amountCents: r.amountCents,
            source: r.source,
          }))
        )
      }

      // Mirror override-aware billing + override-free delivery into the blob.
      await tx
        .update(schema.mediaPlanVersions)
        .set({ legacySchedules })
        .where(eq(schema.mediaPlanVersions.id, versionId))

      const published = input.mode === "publish"
      // BOSS006: empty-cut abort for publish AND new_version (NV-1 approval-change
      // cut with 0 lines is the same defect). mode: "draft" stays exempt.
      if (published || input.mode === "new_version") {
        const [lineCountRow] = await tx
          .select({ n: count() })
          .from(schema.lineItems)
          .where(eq(schema.lineItems.versionId, versionId))
        const lineCount = Number(lineCountRow?.n ?? 0)
        if (lineCount === 0) {
          throw new SavePlanError(
            "BOSS006_EMPTY_PUBLISH",
            "Cannot publish version with 0 line_items (BOSS006 gate)"
          )
        }
      }
      if (published) {
        // PC2: freeze approved_slice once (never mutate after write).
        // VC Stage 2a: do NOT assertVersionMutable here — this is first-write
        // on a new publish row (published_at still null). Guarding would block
        // legitimate first publish; re-mutation is already prevented by the
        // null-check below.
        const [existingSliceRow] = await tx
          .select({ approvedSlice: schema.mediaPlanVersions.approvedSlice })
          .from(schema.mediaPlanVersions)
          .where(eq(schema.mediaPlanVersions.id, versionId))
          .limit(1)
        let approvedSlice = existingSliceRow?.approvedSlice as ApprovedSlice | null | undefined
        if (approvedSlice == null || typeof approvedSlice !== "object") {
          approvedSlice = computeApprovedSlice({
            financials,
            selectedMonthYears: input.selectedMonthYears,
            approvedLineItemIds: approvedLineIdsFromInput(input.lineItems),
          })
          await tx
            .update(schema.mediaPlanVersions)
            .set({ approvedSlice })
            .where(eq(schema.mediaPlanVersions.id, versionId))
        }

        // Widened C1 gate: schedule_months full scope ↔ approved_slice.
        const gateMode = getSaveGateFullScopeMode()
        if (gateMode !== "off") {
          const gate = evaluateFullScopeGate({
            scheduleRows: scheduleRows.filter((r) => r.basis === "billing"),
            approvedSlice: approvedSlice as ApprovedSlice,
            mode: gateMode,
          })
          if (!gate.ok) {
            console.warn("[SAVE_GATE_FULL_SCOPE]", gate.message, {
              versionId,
              mba: input.mbaNumber,
              deltaCents: gate.deltaCents,
              drifts: gate.drifts.slice(0, 8),
            })
            if (gateMode === "enforce") {
              const named = gate.drifts.find((d) => d.lineItemId) ?? gate.drifts[0]
              throw new SavePlanError(
                "C1_FULL_SCOPE",
                gate.message,
                named?.lineItemId ?? undefined
              )
            }
          }
        }

        // VC Stage 1: stamp publication in the SAME txn as the rest of publish.
        // A published-but-unstamped row is the failure mode Stage 1 removes.
        // draft / new_version never reach this block.
        // CS-B: commercial status is a master fact (PATCH /status). Do not
        // write campaign_status onto the version or master from this payload.
        // Stamp created_at and published_at from the same now() so they are
        // equal to the microsecond (smoke S5 / unit assertion).
        await tx
          .update(schema.mediaPlanVersions)
          .set({
            createdAt: sql`now()`,
            publishedAt: sql`now()`,
            publishedBy: normalisePublishedByEmail(input.publishedByEmail),
          })
          .where(eq(schema.mediaPlanVersions.id, versionId))

        await tx
          .update(schema.mediaPlanMasters)
          .set({
            publishedVersionId: versionId,
            campaignName: input.campaignName ?? undefined,
            campaignStartDate: input.campaignStartDate ?? undefined,
            campaignEndDate: input.campaignEndDate ?? undefined,
            campaignBudgetCents: input.campaignBudgetCents ?? undefined,
          })
          .where(eq(schema.mediaPlanMasters.id, input.masterId))

        const fees = input.feeSnapshot ?? (input.feeLoading as Record<string, unknown>) ?? {}
        if (getFeeSnapshotWriteOnce()) {
          // Audit §5.3: write-once per version; admin re-snapshot to overwrite.
          await tx
            .insert(schema.mbaFeeSnapshots)
            .values({
              versionId,
              fees,
            })
            .onConflictDoNothing({
              target: schema.mbaFeeSnapshots.versionId,
            })
        } else {
          await tx
            .insert(schema.mbaFeeSnapshots)
            .values({
              versionId,
              fees,
            })
            .onConflictDoUpdate({
              target: schema.mbaFeeSnapshots.versionId,
              set: {
                fees,
                capturedAt: sql`now()`,
              },
            })
        }

        // PC3: snapshot_checksum over schedule_months + approved_slice + fee snapshot.
        // VC Stage 2a: do NOT assertVersionMutable here — runs after published_at
        // is stamped in this same txn (first-write on publish). A guard would
        // break every publish; there is no separate checksum mutator for
        // already-published rows (cron tripwire is report-only).
        const checksumRows = scheduleRows.map((r) => ({
          lineItemId: r.lineItemId,
          component: r.component,
          basis: r.basis,
          month: String(r.month).slice(0, 10),
          amountCents: Number(r.amountCents) || 0,
          source: String(r.source ?? "computed"),
        }))
        const checksumHex = computeSnapshotChecksum({
          scheduleMonths: checksumRows,
          approvedSlice: approvedSlice as ApprovedSlice,
          feeSnapshot: fees,
        })
        await tx
          .update(schema.mediaPlanVersions)
          .set({ snapshotChecksum: checksumHex })
          .where(eq(schema.mediaPlanVersions.id, versionId))
      }

      const [finalLineCount] = await tx
        .select({ n: count() })
        .from(schema.lineItems)
        .where(eq(schema.lineItems.versionId, versionId))
      const [finalScheduleCount] = await tx
        .select({ n: count() })
        .from(schema.scheduleMonths)
        .where(eq(schema.scheduleMonths.versionId, versionId))

      return {
        versionId,
        versionNumber,
        lineCount: Number(finalLineCount?.n ?? 0),
        scheduleRowCount: Number(finalScheduleCount?.n ?? 0),
        published,
        legacySchedules,
        billingCorrection,
        droppedBillingOverrides,
      }
    })

    // PC5: after publish, flip open-period finance run items for this MBA to stale.
    if (result.published) {
      try {
        const { markRunItemsStaleOnPublish } = await import(
          "@/lib/finance/periods/markStaleOnPublish"
        )
        await markRunItemsStaleOnPublish({
          mbaNumber: input.mbaNumber,
          versionId: result.versionId,
        })
      } catch (err) {
        console.warn("[PC5] stale flip after publish failed", err)
      }
    }

    return result
  } catch (err) {
    if (err instanceof SavePlanError) throw err
    if (isUniqueViolation(err)) {
      const classified = classifySaveUniqueViolation(err)
      if (classified.code === "VERSION_ALREADY_EXISTS") {
        throw new SavePlanError(
          "VERSION_ALREADY_EXISTS",
          `UNIQUE(master_id, version_number) violated for master ${input.masterId} version_number ${attemptedVersionNumber}${
            classified.constraint ? ` (constraint ${classified.constraint})` : ""
          } — aborting`
        )
      }
      if (classified.code === "DUPLICATE_LINE_ITEM_ID") {
        const offending = extractOffendingLineItemId(err, lineIds)
        throw new SavePlanError(
          "DUPLICATE_LINE_ITEM_ID",
          `UNIQUE(version_id, line_item_id) violated${
            offending ? ` for line_item_id "${offending}"` : ""
          }${classified.constraint ? ` (constraint ${classified.constraint})` : ""} — transaction aborted`,
          offending
        )
      }
      throw new SavePlanError(
        "UNIQUE_VIOLATION",
        `Unique constraint violated${
          classified.constraint ? ` (${classified.constraint})` : ""
        } — transaction aborted`
      )
    }
    throw err
  }
}
