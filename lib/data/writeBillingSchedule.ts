/**
 * Partial billing-schedule patch for Alter Billing / inline edits (X3).
 * Updates legacy_schedules.billingSchedule + billing schedule_months only —
 * does not replace line_items (unlike savePlanVersion).
 */

import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import {
  explodeScheduleToMonthRows,
  type ScheduleMonthInsert,
} from "@/scripts/migration/_scheduleTransform"
import { toCents } from "@/scripts/migration/_shared"

function monthToDate(monthKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null
  return `${monthKey}-01`
}

/** Same override→source='override' law as savePlanVersion (billing basis). */
export function reconcileBillingOverrideSources(
  rows: ScheduleMonthInsert[],
  overrides: Array<{
    lineItemId: string
    component: "media" | "fee"
    months: unknown
  }>
): ScheduleMonthInsert[] {
  const out: ScheduleMonthInsert[] = rows.map((r) => ({
    ...r,
    source: "computed" as const,
  }))
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
        const row: ScheduleMonthInsert = {
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

export type PatchBillingScheduleInput = {
  versionId: number
  billingSchedule: unknown
  /** When C1 regenerates delivery, replace delivery months too. */
  deliverySchedule?: unknown
  inputsHash?: string | null
}

export type PatchBillingScheduleResult = {
  ok: true
  versionId: number
  mbaNumber: string
  legacySchedules: Record<string, unknown>
}

export class BillingScheduleWriteError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "BAD_REQUEST",
    message: string
  ) {
    super(message)
    this.name = "BillingScheduleWriteError"
  }
}

export async function patchBillingScheduleOnPostgres(
  input: PatchBillingScheduleInput
): Promise<PatchBillingScheduleResult> {
  const versionId = Number(input.versionId)
  if (!Number.isFinite(versionId) || versionId <= 0) {
    throw new BillingScheduleWriteError("BAD_REQUEST", "version id is required")
  }
  if (input.billingSchedule == null) {
    throw new BillingScheduleWriteError("BAD_REQUEST", "billingSchedule is required")
  }

  const billingExplode = explodeScheduleToMonthRows(
    versionId,
    "billing",
    input.billingSchedule
  )
  if (billingExplode.failureReason) {
    throw new BillingScheduleWriteError(
      "BAD_REQUEST",
      `billing schedule explode failed: ${billingExplode.failureReason}`
    )
  }

  let deliveryExplode: ReturnType<typeof explodeScheduleToMonthRows> | null = null
  if (input.deliverySchedule != null) {
    deliveryExplode = explodeScheduleToMonthRows(
      versionId,
      "delivery",
      input.deliverySchedule
    )
    if (deliveryExplode.failureReason) {
      throw new BillingScheduleWriteError(
        "BAD_REQUEST",
        `delivery schedule explode failed: ${deliveryExplode.failureReason}`
      )
    }
  }

  const db = getDb()
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: schema.mediaPlanVersions.id,
        mbaNumber: schema.mediaPlanVersions.mbaNumber,
        legacySchedules: schema.mediaPlanVersions.legacySchedules,
      })
      .from(schema.mediaPlanVersions)
      .where(eq(schema.mediaPlanVersions.id, versionId))
      .limit(1)

    const row = existing[0]
    if (!row) {
      throw new BillingScheduleWriteError(
        "NOT_FOUND",
        `media_plan_version ${versionId} not found`
      )
    }

    const prevLegacy =
      row.legacySchedules && typeof row.legacySchedules === "object"
        ? ({ ...(row.legacySchedules as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {}

    const nextLegacy: Record<string, unknown> = {
      ...prevLegacy,
      billingSchedule: input.billingSchedule,
    }
    if (input.deliverySchedule != null) {
      nextLegacy.deliverySchedule = input.deliverySchedule
    }

    await tx
      .update(schema.mediaPlanVersions)
      .set({ legacySchedules: nextLegacy })
      .where(eq(schema.mediaPlanVersions.id, versionId))

    const overrideRows = await tx
      .select({
        lineItemId: schema.billingOverrides.lineItemId,
        component: schema.billingOverrides.component,
        months: schema.billingOverrides.months,
      })
      .from(schema.billingOverrides)
      .where(eq(schema.billingOverrides.versionId, versionId))

    const billingRows = reconcileBillingOverrideSources(
      billingExplode.rows,
      overrideRows.map((r) => ({
        lineItemId: r.lineItemId,
        component: r.component === "fee" ? "fee" : "media",
        months: r.months,
      }))
    )

    await tx
      .delete(schema.scheduleMonths)
      .where(
        and(
          eq(schema.scheduleMonths.versionId, versionId),
          eq(schema.scheduleMonths.basis, "billing")
        )
      )

    if (billingRows.length > 0) {
      await tx.insert(schema.scheduleMonths).values(
        billingRows.map((r) => ({
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

    if (deliveryExplode) {
      await tx
        .delete(schema.scheduleMonths)
        .where(
          and(
            eq(schema.scheduleMonths.versionId, versionId),
            eq(schema.scheduleMonths.basis, "delivery")
          )
        )
      if (deliveryExplode.rows.length > 0) {
        await tx.insert(schema.scheduleMonths).values(
          deliveryExplode.rows.map((r) => ({
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
    }

    return {
      ok: true as const,
      versionId,
      mbaNumber: String(row.mbaNumber),
      legacySchedules: nextLegacy,
    }
  })
}
