/**
 * T4a — one transactional media-plan save on Postgres (`DATABASE_URL`).
 *
 * Replaces the Xano 20-table fan-out with a single Drizzle transaction:
 * version upsert → replace-set line_items → server-compute schedule_months
 * (+ billing_overrides → source='override') → legacy_schedules mirror →
 * publish guards (BOSS006) + mba_fee_snapshots.
 *
 * Not wired from the editor until T4c; gated by `WRITE_BACKEND=postgres`.
 */
import { and, count, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { getDb, schema, type Db } from "@/db"
import type { LineChannel } from "@/db/schema"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import {
  computeCampaignFinancials,
} from "@/lib/finance/computeCampaignFinancials"
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
  explodeScheduleToMonthRows,
  type ScheduleMonthInsert,
} from "@/scripts/migration/_scheduleTransform"
import { toCents } from "@/scripts/migration/_shared"

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
   * Month chips at approve time (`January 2026` / `2026-01`). Empty → all
   * billing months in the approved slice.
   */
  selectedMonthYears?: readonly string[]
  getRateForMediaType?: (mediaType: string) => number
  adservaudio?: number
  /**
   * Test-only injection point for the PENFOLD016/BOSS006 kill-shot.
   * Must throw to abort between line_items and schedule_months writes.
   */
  _testHooks?: {
    afterLineItemsInsert?: () => void | Promise<void>
  }
}

export type SavePlanVersionResult = {
  versionId: number
  lineCount: number
  scheduleRowCount: number
  published: boolean
}

export type SavePlanErrorCode =
  | "MISSING_LINE_ITEM_ID"
  | "DUPLICATE_LINE_ITEM_ID"
  | "BOSS006_EMPTY_PUBLISH"
  | "SCHEDULE_EXPLODE_FAILED"
  | "MASTER_NOT_FOUND"
  | "UNIQUE_VIOLATION"
  | "C1_FULL_SCOPE"

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

async function upsertVersionRow(
  tx: Tx,
  input: SavePlanVersionInput,
  legacySchedules: unknown
): Promise<number> {
  const baseValues = {
    masterId: input.masterId,
    versionNumber: input.versionNumber,
    mbaNumber: input.mbaNumber,
    campaignName: input.campaignName ?? null,
    campaignStatus: input.campaignStatus ?? (input.mode === "publish" ? "Approved" : "Draft"),
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
    const existing = await tx
      .select({ id: schema.mediaPlanVersions.id })
      .from(schema.mediaPlanVersions)
      .where(
        and(
          eq(schema.mediaPlanVersions.masterId, input.masterId),
          eq(schema.mediaPlanVersions.versionNumber, input.versionNumber)
        )
      )
      .limit(1)
    if (existing[0]) {
      await tx
        .update(schema.mediaPlanVersions)
        .set({
          campaignName: baseValues.campaignName,
          campaignStatus: baseValues.campaignStatus,
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

  const [inserted] = await tx
    .insert(schema.mediaPlanVersions)
    .values(baseValues)
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
  const financials = computeCampaignFinancials(lineInputs, {
    feeLoading: input.feeLoading ?? {},
  }, {
    getRateForMediaType: input.getRateForMediaType,
    adservaudio: input.adservaudio,
  })

  const legacySchedules = {
    billingSchedule: financials.billingSchedule,
    deliverySchedule: financials.deliverySchedule,
  }

  const lineIds = input.lineItems.map((l) => String(l.lineItemId).trim())

  try {
    return await db.transaction(async (tx) => {
      const versionId = await upsertVersionRow(tx as Tx, input, legacySchedules)

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

      const overrideRows = await tx
        .select({
          lineItemId: schema.billingOverrides.lineItemId,
          component: schema.billingOverrides.component,
          months: schema.billingOverrides.months,
        })
        .from(schema.billingOverrides)
        .where(eq(schema.billingOverrides.versionId, versionId))

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

      // legacy_schedules already written on version upsert; reaffirm after schedules
      // so the mirror matches the just-computed T4a.0-enriched shape.
      await tx
        .update(schema.mediaPlanVersions)
        .set({ legacySchedules })
        .where(eq(schema.mediaPlanVersions.id, versionId))

      const published = input.mode === "publish"
      if (published) {
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

        // PC2: freeze approved_slice once (never mutate after write).
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

        const status = input.campaignStatus ?? "Approved"
        await tx
          .update(schema.mediaPlanVersions)
          .set({ campaignStatus: status })
          .where(eq(schema.mediaPlanVersions.id, versionId))

        await tx
          .update(schema.mediaPlanMasters)
          .set({
            publishedVersionId: versionId,
            campaignStatus: status,
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
        lineCount: Number(finalLineCount?.n ?? 0),
        scheduleRowCount: Number(finalScheduleCount?.n ?? 0),
        published,
      }
    })
  } catch (err) {
    if (err instanceof SavePlanError) throw err
    if (isUniqueViolation(err)) {
      const offending = extractOffendingLineItemId(err, lineIds)
      throw new SavePlanError(
        "DUPLICATE_LINE_ITEM_ID",
        `UNIQUE(version_id, line_item_id) violated${
          offending ? ` for line_item_id "${offending}"` : ""
        } — transaction aborted`,
        offending
      )
    }
    throw err
  }
}
