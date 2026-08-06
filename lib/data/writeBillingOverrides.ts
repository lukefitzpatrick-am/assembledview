/**
 * Manual Billing → billing_overrides mutate path (X2).
 * Replaces Xano `/billing_overrides/replace_line` + `/reset_line`.
 * Response shapes stay `{ ok: true, data }` for billingOverridesClient.
 *
 * BUX-6: after upsert, mirrors amounts onto billing-basis `schedule_months`
 * with `source='override'` (delivery-basis rows untouched).
 *
 * MB-3: reset_line restores those billing-basis rows to computed auto amounts
 * (recompute via computeCampaignFinancials — never copy delivery). replace_line
 * mirrors EVERY billing month for the line (zeros included) and server-gates
 * media month sum ≡ line media total ±$0.01 AND fee month sum ≡ auto fee
 * ±$0.01 (same rule as validateManualOverrideSumRules / savePlan).
 */

import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { mapBillingOverrideFromPostgres } from "@/lib/data/readFinance"
import { isApprovedOrBeyond } from "@/lib/docs/isApprovedOrBeyond"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import {
  attachOverridesToLineInputs,
  type BillingOverrideRow,
} from "@/lib/finance/billingOverrides"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import type {
  FeeLoading,
  LineItemInput,
  MonthAmount,
} from "@/lib/finance/campaignFinancials.types"
import { billingOverrideLineIdsMatch } from "@/lib/finance/manualBillingOverridesUi"
import { formatAUD, roundMoney2 } from "@/lib/format/money"
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
    public readonly code:
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "SUM_VIOLATION"
      | "VERSION_PUBLISHED_IMMUTABLE",
    message: string,
    public readonly delta?: number,
    public readonly expected?: number,
    public readonly actual?: number
  ) {
    super(message)
    this.name = "BillingOverrideWriteError"
  }
}

const MEDIA_SUM_TOLERANCE = 0.01

function normalizeComponent(raw: unknown): BillingOverrideComponent {
  return String(raw ?? "media").toLowerCase() === "fee" ? "fee" : "media"
}

function monthToDate(monthKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null
  return `${monthKey}-01`
}

function scheduleMonthYearToIso(monthYear: string): string {
  const key = normalizeMonthKey(monthYear)
  return key || String(monthYear).trim()
}

function parseMonthsPayload(raw: unknown): MonthAmount[] {
  let monthsRaw = raw
  if (typeof monthsRaw === "string") {
    try {
      monthsRaw = JSON.parse(monthsRaw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(monthsRaw)) return []
  const out: MonthAmount[] = []
  for (const entry of monthsRaw) {
    if (!entry || typeof entry !== "object") continue
    const monthLabel = String((entry as { month?: unknown }).month ?? "").trim()
    const monthKey = normalizeMonthKey(monthLabel)
    if (!monthKey) continue
    const amountRaw = (entry as { amount?: unknown }).amount
    const amountNum =
      typeof amountRaw === "number"
        ? amountRaw
        : Number.parseFloat(String(amountRaw ?? "").replace(/[$,\s]/g, ""))
    if (!Number.isFinite(amountNum)) continue
    out.push({ month: monthKey, amount: roundMoney2(amountNum) })
  }
  return out
}

/**
 * Hydrate LineItemInput[] + feeLoading for a version — same compute path as
 * savePlanVersion (bursts/attrs + fee snapshot), without billing_overrides.
 */
async function loadVersionLineInputsForCompute(versionId: number): Promise<{
  lineInputs: LineItemInput[]
  feeLoading: FeeLoading
}> {
  const db = getDb()
  const lines = await db
    .select()
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, versionId))

  const [snap] = await db
    .select({ fees: schema.mbaFeeSnapshots.fees })
    .from(schema.mbaFeeSnapshots)
    .where(eq(schema.mbaFeeSnapshots.versionId, versionId))
    .limit(1)
  const feeLoading =
    snap?.fees && typeof snap.fees === "object"
      ? (snap.fees as FeeLoading)
      : {}

  const lineInputs: LineItemInput[] = lines.map((row) => {
    const attrs = (row.attrs ?? {}) as Record<string, unknown>
    const burstsRaw = Array.isArray(row.bursts) ? row.bursts : []
    let enteredAmount =
      Number(attrs.enteredAmount ?? attrs.entered_amount ?? 0) || 0
    if (enteredAmount <= 0) {
      enteredAmount = burstsRaw.reduce((s, b) => {
        if (!b || typeof b !== "object") return s
        return s + (Number((b as { budget?: unknown }).budget) || 0)
      }, 0)
    }
    const feePct =
      typeof attrs.feePct === "number" && Number.isFinite(attrs.feePct)
        ? attrs.feePct
        : typeof attrs.fee_percentage === "number" &&
            Number.isFinite(attrs.fee_percentage)
          ? attrs.fee_percentage
          : undefined
    return {
      lineItemId: String(row.lineItemId).trim(),
      mediaType: String(attrs.media_type ?? attrs.mediaType ?? row.channel),
      buyType: String(row.buyType ?? attrs.buyType ?? "cpc"),
      rate: Number(attrs.rate ?? 0) || 0,
      enteredAmount,
      budgetIncludesFees: Boolean(row.budgetIncludesFees),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      noAdserving: row.noAdserving ?? undefined,
      feePct,
      bursts: burstsRaw as LineItemInput["bursts"],
      approval: "approved",
      label:
        attrs.label != null
          ? String(attrs.label)
          : attrs.header1 != null
            ? String(attrs.header1)
            : undefined,
    }
  })

  return { lineInputs, feeLoading }
}

/**
 * Auto (override-free) billing month amounts for one line/component — derived
 * via computeCampaignFinancials, not delivery-basis copy.
 * `lineComponentTotal` is component-correct: media → pl.media, fee → pl.fee
 * (with schedule_months fallback when draft reload lacks feePct / fee snapshot).
 */
async function computeAutoBillingMonthsForLine(args: {
  versionId: number
  lineItemId: string
  component: BillingOverrideComponent
}): Promise<{ months: MonthAmount[]; lineComponentTotal: number }> {
  const { lineInputs, feeLoading } = await loadVersionLineInputsForCompute(
    args.versionId
  )
  const financials = computeCampaignFinancials(lineInputs, { feeLoading })
  const pl = financials.perLine.find(
    (p) => String(p.lineItemId).trim() === args.lineItemId
  )

  const byIso = new Map<string, number>()
  for (const month of financials.billingSchedule) {
    const iso = scheduleMonthYearToIso(String(month.monthYear ?? ""))
    if (!iso) continue
    const buckets = month.lineItems ?? {}
    for (const items of Object.values(buckets)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        if (String(line.id ?? "").trim() !== args.lineItemId) continue
        const amt =
          args.component === "fee"
            ? Number(line.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
            : Number(line.monthlyAmounts?.[month.monthYear] ?? 0) || 0
        byIso.set(iso, roundMoney2((byIso.get(iso) ?? 0) + amt))
      }
    }
  }

  // Fallback: per-line months when lineItems absent on headers.
  if (byIso.size === 0 && pl) {
    if (args.component === "media") {
      for (const m of pl.billingMonths) {
        const iso = scheduleMonthYearToIso(m.month)
        if (!iso) continue
        byIso.set(iso, roundMoney2(m.amount))
      }
    } else {
      // Fee counterpart of pl.billingMonths: schedule feeMonthlyAmounts for this
      // line (canonical id match — primary walk uses strict equality).
      for (const month of financials.billingSchedule) {
        const iso = scheduleMonthYearToIso(String(month.monthYear ?? ""))
        if (!iso) continue
        const buckets = month.lineItems ?? {}
        for (const items of Object.values(buckets)) {
          if (!Array.isArray(items)) continue
          for (const line of items) {
            if (
              !billingOverrideLineIdsMatch(
                String(line.id ?? ""),
                args.lineItemId
              )
            ) {
              continue
            }
            const amt =
              Number(line.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
            byIso.set(iso, roundMoney2((byIso.get(iso) ?? 0) + amt))
          }
        }
      }
    }
  }

  let months = [...byIso.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))

  if (args.component === "fee") {
    let lineComponentTotal = pl ? roundMoney2(pl.fee) : 0
    const monthsSum = roundMoney2(
      months.reduce((s, m) => s + (Number(m.amount) || 0), 0)
    )

    // Draft tip often has no mba_fee_snapshots and may lack attrs.feePct, so
    // recompute yields pl.fee=0 even though savePlan already wrote the auto fee
    // into schedule_months. Timing-only gate must use that persisted auto fee —
    // never silently expect $0 (would accept any override amount).
    if (lineComponentTotal === 0 && monthsSum === 0) {
      const db = getDb()
      const persisted = await db
        .select({
          month: schema.scheduleMonths.month,
          amountCents: schema.scheduleMonths.amountCents,
          source: schema.scheduleMonths.source,
        })
        .from(schema.scheduleMonths)
        .where(
          and(
            eq(schema.scheduleMonths.versionId, args.versionId),
            eq(schema.scheduleMonths.lineItemId, args.lineItemId),
            eq(schema.scheduleMonths.component, "fee"),
            eq(schema.scheduleMonths.basis, "billing")
          )
        )
      const autoRows = persisted.filter((r) => r.source === "computed")
      const useRows = autoRows.length > 0 ? autoRows : []
      if (useRows.length > 0) {
        const persistedByIso = new Map<string, number>()
        for (const r of useRows) {
          const iso = String(r.month).slice(0, 7)
          if (!/^\d{4}-\d{2}$/.test(iso)) continue
          persistedByIso.set(
            iso,
            roundMoney2(
              (persistedByIso.get(iso) ?? 0) + (Number(r.amountCents) || 0) / 100
            )
          )
        }
        months = [...persistedByIso.entries()]
          .map(([month, amount]) => ({ month, amount }))
          .sort((a, b) => a.month.localeCompare(b.month))
        lineComponentTotal = roundMoney2(
          months.reduce((s, m) => s + (Number(m.amount) || 0), 0)
        )
      }
    }

    // Never accept against an empty span (INVARIANTS fail-soft ban).
    if (months.length === 0) {
      throw new BillingOverrideWriteError(
        "BAD_REQUEST",
        `Cannot derive auto fee baseline for line ${args.lineItemId}`
      )
    }
    return { months, lineComponentTotal }
  }

  return {
    months,
    lineComponentTotal: pl ? roundMoney2(pl.media) : 0,
  }
}

/**
 * Expand payload months to the full auto billing span for the line.
 * Months present on auto but missing from payload → $0 (manual redistribution).
 * Extra payload months outside the span are kept.
 */
function expandOverrideMonthsToFullSpan(
  payload: MonthAmount[],
  autoSpan: MonthAmount[]
): MonthAmount[] {
  const byIso = new Map<string, number>()
  for (const m of autoSpan) {
    const key = normalizeMonthKey(m.month) || m.month
    if (key) byIso.set(key, 0)
  }
  for (const m of payload) {
    const key = normalizeMonthKey(m.month) || m.month
    if (!key) continue
    byIso.set(key, roundMoney2(m.amount))
  }
  return [...byIso.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Upsert billing-basis schedule_months for one override line (source=override).
 * Writes every month in `months` (zeros included). Never touches delivery.
 */
async function mirrorOverrideIntoBillingScheduleMonths(args: {
  versionId: number
  lineItemId: string
  component: BillingOverrideComponent
  months: MonthAmount[]
  db?: ReturnType<typeof getDb>
}): Promise<void> {
  const db = args.db ?? getDb()
  for (const entry of args.months) {
    const monthKey = normalizeMonthKey(entry.month) || entry.month
    const monthDate = monthToDate(monthKey)
    if (!monthDate) continue
    const amountCents = toCents(entry.amount)

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

/**
 * MB-3 inverse of the override mirror: rewrite billing-basis schedule_months
 * for (version, line, component) to computed auto amounts / source='computed'.
 * Delivery-basis rows are never touched.
 */
async function restoreBillingScheduleMonthsToComputed(args: {
  versionId: number
  lineItemId: string
  component: BillingOverrideComponent
  db?: ReturnType<typeof getDb>
}): Promise<void> {
  const db = args.db ?? getDb()
  const { months } = await computeAutoBillingMonthsForLine({
    versionId: args.versionId,
    lineItemId: args.lineItemId,
    component: args.component,
  })

  await db
    .delete(schema.scheduleMonths)
    .where(
      and(
        eq(schema.scheduleMonths.versionId, args.versionId),
        eq(schema.scheduleMonths.lineItemId, args.lineItemId),
        eq(schema.scheduleMonths.component, args.component),
        eq(schema.scheduleMonths.basis, "billing")
      )
    )

  if (months.length === 0) return

  await db.insert(schema.scheduleMonths).values(
    months.map((m) => {
      const monthKey = normalizeMonthKey(m.month) || m.month
      return {
        versionId: args.versionId,
        lineItemId: args.lineItemId,
        component: args.component,
        basis: "billing" as const,
        month: monthToDate(monthKey)!,
        amountCents: toCents(m.amount),
        source: "computed" as const,
      }
    }).filter((r) => r.month)
  )
}

/**
 * After reset deletes overrides, rewrite legacy_schedules billing blob from
 * remaining overrides (same attach→compute path as savePlan MB-1) so blob and
 * schedule_months stay aligned under DATA_BACKEND_FINANCE_SCHEDULE=blob.
 */
async function reaffirmLegacySchedulesAfterOverrideChange(
  versionId: number,
  db: ReturnType<typeof getDb>
): Promise<void> {
  const { lineInputs, feeLoading } = await loadVersionLineInputsForCompute(
    versionId
  )
  const overrideRows = await db
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

  const forAttach: BillingOverrideRow[] = overrideRows.map((r) => ({
    line_item_id: r.lineItemId,
    component: r.component === "fee" ? "fee" : "media",
    mode: r.mode ?? "manual",
    reason: r.reason,
    months: r.months as BillingOverrideRow["months"],
    date_basis: r.dateBasis,
  }))
  const withOverrides = attachOverridesToLineInputs(lineInputs, forAttach)
  const financials = computeCampaignFinancials(withOverrides, { feeLoading })
  await db
    .update(schema.mediaPlanVersions)
    .set({
      legacySchedules: {
        billingSchedule: financials.billingSchedule,
        deliverySchedule: financials.deliverySchedule,
      },
    })
    .where(eq(schema.mediaPlanVersions.id, versionId))
}

/** Defence-in-depth: version row must exist and match mba_number. */
async function assertVersionOwnedByMba(
  versionId: number,
  mbaNumber: string
): Promise<{
  id: number
  versionNumber: number
  campaignStatus: string | null
  publishedAt: string | null
}> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      campaignStatus: schema.mediaPlanVersions.campaignStatus,
      publishedAt: schema.mediaPlanVersions.publishedAt,
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
  return {
    id: row.id,
    versionNumber: Number(row.versionNumber),
    campaignStatus: row.campaignStatus,
    publishedAt: row.publishedAt != null ? String(row.publishedAt) : null,
  }
}

/**
 * MB-15c — approved-or-beyond versions are immutable to billing writers.
 *
 * Stage 1 scope: publication (published_at) answers "may the client have this".
 * Mutability still keys off commercial status until Stage 2 makes published
 * versions immutable deliberately. Do not merge these two predicates —
 * they are different sets (planned is downloadable but not frozen).
 *
 * `publishedAt` is still selected on the ownership row (VC1-1 plumbing); it is
 * not the mutability gate here.
 */
async function assertVersionBillingMutable(
  versionId: number,
  mbaNumber: string
): Promise<void> {
  const row = await assertVersionOwnedByMba(versionId, mbaNumber)
  void row.publishedAt
  if (!isApprovedOrBeyond(row.campaignStatus)) return
  const status = String(row.campaignStatus ?? "").trim() || "unknown"
  throw new BillingOverrideWriteError(
    "VERSION_PUBLISHED_IMMUTABLE",
    `VERSION_PUBLISHED_IMMUTABLE: version ${row.id} (v${row.versionNumber}, status ${status}) — billing_overrides and billing-basis schedule_months are immutable after approved. Publish a new version to change billing timing.`
  )
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

  await assertVersionBillingMutable(versionId, mbaNumber)

  const payloadMonths = parseMonthsPayload(input.months)
  if (payloadMonths.length === 0) {
    throw new BillingOverrideWriteError("BAD_REQUEST", "months[] is required")
  }

  const { months: autoSpan, lineComponentTotal } =
    await computeAutoBillingMonthsForLine({
      versionId,
      lineItemId,
      component,
    })
  const fullMonths = expandOverrideMonthsToFullSpan(payloadMonths, autoSpan)

  const actual = roundMoney2(
    fullMonths.reduce((s, m) => s + (Number(m.amount) || 0), 0)
  )
  const expected = roundMoney2(lineComponentTotal)
  const delta = roundMoney2(actual - expected)
  if (Math.abs(delta) > MEDIA_SUM_TOLERANCE) {
    const message =
      component === "fee"
        ? `Fee months add to ${formatAUD(actual)} but auto fee is ${formatAUD(expected)} — adjust the months to match (off by ${formatAUD(Math.abs(delta))}).`
        : `Manual billing months must sum to the line media total (timing only). Got ${actual.toFixed(2)}, expected ${expected.toFixed(2)} (Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}).`
    throw new BillingOverrideWriteError(
      "SUM_VIOLATION",
      message,
      delta,
      expected,
      actual
    )
  }

  const db = getDb()
  const mode = input.mode != null ? String(input.mode) : "manual"
  const reason = input.reason != null ? String(input.reason) : "manual"

  try {
    const row = await db.transaction(async (tx) => {
      const upserted = await tx
        .insert(schema.billingOverrides)
        .values({
          versionId,
          lineItemId,
          component,
          mode,
          reason,
          months: fullMonths,
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
            months: fullMonths,
            dateBasis,
          },
        })
        .returning()

      const inserted = upserted[0]
      if (!inserted) {
        throw new BillingOverrideWriteError(
          "BAD_REQUEST",
          "replace_line upsert returned no row"
        )
      }

      await mirrorOverrideIntoBillingScheduleMonths({
        versionId,
        lineItemId,
        component,
        months: fullMonths,
        db: tx as unknown as ReturnType<typeof getDb>,
      })

      // Belt-and-braces: re-read billing months and sum-check (media + fee).
      const rows = await tx
        .select({
          amountCents: schema.scheduleMonths.amountCents,
        })
        .from(schema.scheduleMonths)
        .where(
          and(
            eq(schema.scheduleMonths.versionId, versionId),
            eq(schema.scheduleMonths.lineItemId, lineItemId),
            eq(schema.scheduleMonths.component, component),
            eq(schema.scheduleMonths.basis, "billing")
          )
        )
      const mirroredActual = roundMoney2(
        rows.reduce((s, r) => s + (Number(r.amountCents) || 0) / 100, 0)
      )
      const mirroredExpected = roundMoney2(lineComponentTotal)
      const mirroredDelta = roundMoney2(mirroredActual - mirroredExpected)
      if (Math.abs(mirroredDelta) > MEDIA_SUM_TOLERANCE) {
        const message =
          component === "fee"
            ? `Fee months add to ${formatAUD(mirroredActual)} but auto fee is ${formatAUD(mirroredExpected)} — adjust the months to match (off by ${formatAUD(Math.abs(mirroredDelta))}).`
            : `After mirror, billing media months sum to ${mirroredActual.toFixed(2)} but line media is ${mirroredExpected.toFixed(2)} (Δ ${mirroredDelta >= 0 ? "+" : ""}${mirroredDelta.toFixed(2)}).`
        throw new BillingOverrideWriteError(
          "SUM_VIOLATION",
          message,
          mirroredDelta,
          mirroredExpected,
          mirroredActual
        )
      }

      await reaffirmLegacySchedulesAfterOverrideChange(
        versionId,
        tx as unknown as ReturnType<typeof getDb>
      )

      return inserted
    })

    return mapBillingOverrideFromPostgres(row as Record<string, unknown>)
  } catch (err) {
    if (err instanceof BillingOverrideWriteError) throw err
    console.error("[writeBillingOverrides] replace_line failed", {
      versionId,
      lineItemId,
      component,
      message: err instanceof Error ? err.message : String(err),
    })
    throw new BillingOverrideWriteError(
      "BAD_REQUEST",
      "Override save failed — retry Save billing changes"
    )
  }
}

/**
 * Delete override row(s) for a line ("reset to auto") and restore billing-basis
 * schedule_months to computed auto amounts (MB-3). Delivery untouched.
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

  await assertVersionBillingMutable(versionId, mbaNumber)

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

  const componentsToRestore: BillingOverrideComponent[] = component
    ? [component]
    : ["media", "fee"]

  let deletedCount = 0
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.billingOverrides)
      .where(and(...predicates))
      .returning({ id: schema.billingOverrides.id })
    deletedCount = deleted.length

    for (const comp of componentsToRestore) {
      await restoreBillingScheduleMonthsToComputed({
        versionId,
        lineItemId,
        component: comp,
        db: tx as unknown as ReturnType<typeof getDb>,
      })
    }

    await reaffirmLegacySchedulesAfterOverrideChange(
      versionId,
      tx as unknown as ReturnType<typeof getDb>
    )
  })

  return {
    deleted: deletedCount,
    line_item_id: lineItemId,
    ...(component ? { component } : {}),
  }
}
