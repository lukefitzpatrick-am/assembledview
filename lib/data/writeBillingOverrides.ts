/**
 * Manual Billing → billing_overrides mutate path (X2).
 * Replaces Xano `/billing_overrides/replace_line` + `/reset_line`.
 * Response shapes stay `{ ok: true, data }` for billingOverridesClient.
 *
 * BUX-6: after upsert, also mirrors amounts onto billing-basis `schedule_months`
 * with `source='override'` (delivery-basis rows untouched).
 */

import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { mapBillingOverrideFromPostgres } from "@/lib/data/readFinance"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import { toCents } from "@/scripts/migration/_shared"

export type BillingOverrideComponent = "media" | "fee"

export type ReplaceBillingOverrideLineInput = {
  versionId: number
  mbaNumber: string
  lineItemId: string
  component: BillingOverrideComponent
  months: unknown
  dateBasis: string
  mode?: string | null
  reason?: string | null
}

export type ResetBillingOverrideLineInput = {
  versionId: number
  mbaNumber: string
  lineItemId: string
  component?: BillingOverrideComponent | null
}

export class BillingOverrideWriteError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "BAD_REQUEST",
    message: string
  ) {
    super(message)
    this.name = "BillingOverrideWriteError"
  }
}

function normalizeComponent(raw: unknown): BillingOverrideComponent {
  return String(raw ?? "media").toLowerCase() === "fee" ? "fee" : "media"
}

function monthToDate(monthKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null
  return `${monthKey}-01`
}

/**
 * Upsert billing-basis schedule_months for one override line (source=override).
 * Never deletes delivery-basis rows. Inserts missing billing months when needed.
 */
async function mirrorOverrideIntoBillingScheduleMonths(args: {
  versionId: number
  lineItemId: string
  component: BillingOverrideComponent
  months: unknown
}): Promise<void> {
  let monthsRaw = args.months
  if (typeof monthsRaw === "string") {
    try {
      monthsRaw = JSON.parse(monthsRaw)
    } catch {
      return
    }
  }
  if (!Array.isArray(monthsRaw)) return

  const db = getDb()
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

    await db
      .insert(schema.scheduleMonths)
      .values({
        versionId: args.versionId,
        lineItemId: args.lineItemId,
        component: args.component,
        basis: "billing",
        month: monthDate,
        amountCents,
        source: "override",
      })
      .onConflictDoUpdate({
        target: [
          schema.scheduleMonths.versionId,
          schema.scheduleMonths.lineItemId,
          schema.scheduleMonths.component,
          schema.scheduleMonths.basis,
          schema.scheduleMonths.month,
        ],
        set: {
          amountCents,
          source: "override",
        },
      })
  }

}

/** Defence-in-depth: version row must exist and match mba_number. */
async function assertVersionOwnedByMba(
  versionId: number,
  mbaNumber: string
): Promise<void> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new BillingOverrideWriteError(
      "NOT_FOUND",
      `media_plan_version ${versionId} not found`
    )
  }
  if (String(row.mbaNumber).trim() !== mbaNumber) {
    throw new BillingOverrideWriteError(
      "NOT_FOUND",
      `media_plan_version ${versionId} does not belong to MBA ${mbaNumber}`
    )
  }
}

/**
 * Upsert one (version, line_item_id, component) override row.
 * Returns the API-shaped row (includes media_plan_version alias).
 */
export async function replaceBillingOverrideLine(
  input: ReplaceBillingOverrideLineInput
): Promise<Record<string, unknown>> {
  const versionId = Number(input.versionId)
  const mbaNumber = String(input.mbaNumber ?? "").trim()
  const lineItemId = String(input.lineItemId ?? "").trim()
  const dateBasis = String(input.dateBasis ?? "").trim()
  const component = normalizeComponent(input.component)

  if (!Number.isFinite(versionId) || versionId <= 0) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "media_plan_version_id is required")
  }
  if (!mbaNumber) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "mba_number is required")
  }
  if (!lineItemId) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "line_item_id is required")
  }
  if (!dateBasis) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "date_basis is required")
  }
  if (!Array.isArray(input.months)) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "months[] is required")
  }

  await assertVersionOwnedByMba(versionId, mbaNumber)

  const db = getDb()
  const mode = input.mode != null ? String(input.mode) : "manual"
  const reason = input.reason != null ? String(input.reason) : "manual"

  const upserted = await db
    .insert(schema.billingOverrides)
    .values({
      versionId,
      lineItemId,
      component,
      mode,
      reason,
      months: input.months,
      dateBasis,
    })
    .onConflictDoUpdate({
      target: [
        schema.billingOverrides.versionId,
        schema.billingOverrides.lineItemId,
        schema.billingOverrides.component,
      ],
      set: {
        mode,
        reason,
        months: input.months,
        dateBasis,
      },
    })
    .returning()

  const row = upserted[0]
  if (!row) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "replace_line upsert returned no row")
  }

  try {
    await mirrorOverrideIntoBillingScheduleMonths({
      versionId,
      lineItemId,
      component,
      months: input.months,
    })
  } catch (err) {
    console.error("[writeBillingOverrides] schedule_months mirror failed", {
      versionId,
      lineItemId,
      component,
      message: err instanceof Error ? err.message : String(err),
    })
    throw new BillingOverrideWriteError(
      "BAD_REQUEST",
      "Override saved but billing schedule_months mirror failed — retry Save billing changes"
    )
  }

  return mapBillingOverrideFromPostgres(row as Record<string, unknown>)
}

/**
 * Delete override row(s) for a line ("reset to auto").
 * When component omitted, deletes both media and fee for that line.
 */
export async function resetBillingOverrideLine(
  input: ResetBillingOverrideLineInput
): Promise<{ deleted: number; line_item_id: string; component?: BillingOverrideComponent }> {
  const versionId = Number(input.versionId)
  const mbaNumber = String(input.mbaNumber ?? "").trim()
  const lineItemId = String(input.lineItemId ?? "").trim()

  if (!Number.isFinite(versionId) || versionId <= 0) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "media_plan_version_id is required")
  }
  if (!mbaNumber) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "mba_number is required")
  }
  if (!lineItemId) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "line_item_id is required")
  }

  await assertVersionOwnedByMba(versionId, mbaNumber)

  const db = getDb()
  const predicates = [
    eq(schema.billingOverrides.versionId, versionId),
    eq(schema.billingOverrides.lineItemId, lineItemId),
  ]
  let component: BillingOverrideComponent | undefined
  if (input.component != null && String(input.component).trim() !== "") {
    component = normalizeComponent(input.component)
    predicates.push(eq(schema.billingOverrides.component, component))
  }

  const deleted = await db
    .delete(schema.billingOverrides)
    .where(and(...predicates))
    .returning({ id: schema.billingOverrides.id })

  return {
    deleted: deleted.length,
    line_item_id: lineItemId,
    ...(component ? { component } : {}),
  }
}
