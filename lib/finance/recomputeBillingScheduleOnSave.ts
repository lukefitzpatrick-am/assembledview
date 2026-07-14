/**
 * C1 — server recompute / validate billing schedule on save.
 *
 * - Recomputes via {@link computeCampaignFinancials} with table overrides attached.
 * - AUTO lines must match recompute within $0.01 (else 409 + delta).
 * - Manual media / fee-override lines are exempt from equality; they must pass
 *   sum rules (C2). Full C2 surface lands separately — the media sum gate is
 *   enforced here so dirty manual rows cannot round-trip.
 * - Omitting the client schedule → generate from recompute (never store null).
 * - Clean save: set `inputs_hash`, `rebill_needed: false`.
 */

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import {
  attachOverridesToLineInputs,
  type BillingOverrideRow,
} from "@/lib/finance/billingOverrides"
import type {
  CampaignFinancials,
  FeeLoading,
  LineItemInput,
  PerLineResult,
} from "@/lib/finance/campaignFinancials.types"
import {
  computeCampaignFinancials,
  type ComputeCampaignFinancialsOpts,
} from "@/lib/finance/computeCampaignFinancials"
import { computeBillingInputsHash } from "@/lib/finance/computeBillingInputsHash"
import { roundMoney2 } from "@/lib/format/money"

export const BILLING_AUTO_EQUALITY_TOLERANCE = 0.01

export type AutoLineDelta = {
  lineItemId: string
  field: "media" | "fee"
  clientTotal: number
  serverTotal: number
  delta: number
}

export type ManualSumViolation = {
  lineItemId: string
  component: "media" | "fee"
  expected: number
  actual: number
  delta: number
  message: string
}

export type RecomputeBillingScheduleOnSaveOk = {
  ok: true
  billingSchedule: BillingMonth[]
  deliverySchedule: BillingMonth[]
  inputs_hash: string
  /** Always false on a clean validated save (C1). */
  rebill_needed: false
  financials: CampaignFinancials
  /** True when the persisted schedule came from server recompute (client omitted). */
  generatedFromServer: boolean
}

export type RecomputeBillingScheduleOnSaveErr = {
  ok: false
  status: 400 | 409
  body: {
    error: string
    code: string
    delta?: {
      lines: AutoLineDelta[]
      totalDeltaExGst: number
    }
    sumViolations?: ManualSumViolation[]
  }
}

export type RecomputeBillingScheduleOnSaveResult =
  | RecomputeBillingScheduleOnSaveOk
  | RecomputeBillingScheduleOnSaveErr

type CollectedLine = {
  line: BillingLineItem
  mediaTotal: number
  feeTotal: number
}

function collectScheduleLines(months: BillingMonth[]): Map<string, CollectedLine> {
  const map = new Map<string, CollectedLine>()
  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items as BillingLineItem[]) {
        const id = String(item.id ?? "").trim()
        if (!id) continue
        const mediaAmt = Number(item.monthlyAmounts?.[month.monthYear] ?? 0) || 0
        const feeAmt = Number(item.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
        const existing = map.get(id)
        if (existing) {
          existing.mediaTotal = roundMoney2(existing.mediaTotal + mediaAmt)
          existing.feeTotal = roundMoney2(existing.feeTotal + feeAmt)
        } else {
          map.set(id, {
            line: item,
            mediaTotal: roundMoney2(mediaAmt),
            feeTotal: roundMoney2(feeAmt),
          })
        }
      }
    }
  }
  return map
}

function exceedsTolerance(a: number, b: number, tol = BILLING_AUTO_EQUALITY_TOLERANCE): boolean {
  return Math.abs(a - b) > tol
}

function isManualMediaLine(
  clientLine: BillingLineItem | undefined,
  serverPerLine: PerLineResult | undefined,
  input: LineItemInput | undefined
): boolean {
  if (clientLine?.billingMode === "manual") return true
  if (serverPerLine?.flags.manualBilling) return true
  if (input?.billingOverride?.mode === "manual") return true
  return false
}

function isManualFeeLine(
  clientLine: BillingLineItem | undefined,
  serverPerLine: PerLineResult | undefined,
  input: LineItemInput | undefined
): boolean {
  if (clientLine?.feeBillingMode === "manual") return true
  if (serverPerLine?.flags.manualFee) return true
  if (input?.feeOverride?.mode === "manual") return true
  return false
}

/**
 * C2 sum rules (partial):
 * - Manual media override months must sum to the line's computed media (±$0.01).
 * - Fee overrides define the effective fee by construction — no sum equality check.
 */
export function validateManualOverrideSumRules(args: {
  lineItems: LineItemInput[]
  financials: CampaignFinancials
}): ManualSumViolation[] {
  const perLineById = new Map(args.financials.perLine.map((p) => [p.lineItemId, p]))
  const violations: ManualSumViolation[] = []

  for (const line of args.lineItems) {
    const pl = perLineById.get(line.lineItemId)
    if (!pl || pl.flags.excluded) continue

    if (line.billingOverride?.mode === "manual" && line.billingOverride.months?.length) {
      const actual = roundMoney2(
        line.billingOverride.months.reduce((s, m) => s + (Number(m.amount) || 0), 0)
      )
      // Media override must sum to booked line media (client-pays → billable media 0).
      const expected = line.clientPaysForMedia ? 0 : roundMoney2(pl.media)
      if (exceedsTolerance(actual, expected)) {
        violations.push({
          lineItemId: line.lineItemId,
          component: "media",
          expected,
          actual,
          delta: roundMoney2(actual - expected),
          message: `Manual media override months sum ${actual} ≠ line media ${expected}`,
        })
      }
    }

    // Fee override: effective fee IS the override sum (B2). No C2 sum equality gate.
  }

  return violations
}

function compareAutoLines(args: {
  clientSchedule: BillingMonth[]
  lineItems: LineItemInput[]
  financials: CampaignFinancials
}): AutoLineDelta[] {
  const clientLines = collectScheduleLines(args.clientSchedule)
  const perLineById = new Map(args.financials.perLine.map((p) => [p.lineItemId, p]))
  const inputById = new Map(args.lineItems.map((l) => [l.lineItemId, l]))
  const deltas: AutoLineDelta[] = []

  // Server authoritative per-line totals come from computeCampaignFinancials
  // (schedule JSON may omit lineItems on the recompute path).
  for (const pl of args.financials.perLine) {
    if (pl.flags.excluded) continue
    const id = pl.lineItemId
    const client = clientLines.get(id)
    const input = inputById.get(id)
    const serverMedia = roundMoney2(
      pl.billingMonths.reduce((s, m) => s + m.amount, 0)
    )
    const serverFee = roundMoney2(pl.fee)

    if (!isManualMediaLine(client?.line, pl, input)) {
      const clientTotal = client?.mediaTotal ?? 0
      // When the client schedule has no lineItems at all, skip per-line media
      // checks — campaign-total gate below still catches stale headers.
      if (clientLines.size > 0 && exceedsTolerance(clientTotal, serverMedia)) {
        deltas.push({
          lineItemId: id,
          field: "media",
          clientTotal,
          serverTotal: serverMedia,
          delta: roundMoney2(clientTotal - serverMedia),
        })
      }
    }

    if (!isManualFeeLine(client?.line, pl, input)) {
      const clientTotal = client?.feeTotal ?? 0
      const clientHasFeeBreakdown = Boolean(client?.line?.feeMonthlyAmounts)
      // Only compare fee when the client stamped fee months (otherwise older
      // payloads only carry media on lineItems + fee on month headers).
      if (
        clientLines.size > 0 &&
        clientHasFeeBreakdown &&
        exceedsTolerance(clientTotal, serverFee)
      ) {
        deltas.push({
          lineItemId: id,
          field: "fee",
          clientTotal,
          serverTotal: serverFee,
          delta: roundMoney2(clientTotal - serverFee),
        })
      }
    }
  }

  return deltas
}

function scheduleMediaFeeTotal(months: BillingMonth[]): number {
  let total = 0
  for (const m of months) {
    const media = parseFloat(String(m.mediaTotal ?? "").replace(/[^0-9.-]/g, "")) || 0
    const fee = parseFloat(String(m.feeTotal ?? "").replace(/[^0-9.-]/g, "")) || 0
    total += media + fee
  }
  return roundMoney2(total)
}

function coerceClientBillingSchedule(raw: unknown): BillingMonth[] {
  const asArray = (() => {
    if (Array.isArray(raw)) return raw
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    if (raw && typeof raw === "object" && Array.isArray((raw as { months?: unknown }).months)) {
      return (raw as { months: unknown[] }).months
    }
    return null
  })()
  if (!asArray?.length) return []

  const sample = asArray[0] as Record<string, unknown> | undefined
  // Already BillingMonth-shaped (editor / recompute output) — preserve header totals.
  if (
    sample &&
    typeof sample === "object" &&
    typeof sample.monthYear === "string" &&
    ("mediaTotal" in sample || "feeTotal" in sample)
  ) {
    return JSON.parse(JSON.stringify(asArray)) as BillingMonth[]
  }
  return parsePersistedBillingScheduleToMonths(raw) ?? []
}

function clientScheduleOmitted(raw: unknown): boolean {
  if (raw == null) return true
  if (typeof raw === "string" && raw.trim() === "") return true
  if (Array.isArray(raw) && raw.length === 0) return true
  return false
}

export function recomputeAndValidateBillingScheduleOnSave(args: {
  lineItems: LineItemInput[]
  feeLoading: FeeLoading
  /** Raw client-sent billingSchedule (may be null/omitted). */
  clientBillingSchedule: unknown
  overrideRows: BillingOverrideRow[]
  opts?: ComputeCampaignFinancialsOpts
}): RecomputeBillingScheduleOnSaveResult {
  if (!args.lineItems.length) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "lineItems are required to recompute/validate the billing schedule",
        code: "BILLING_RECOMPUTE_MISSING_LINE_ITEMS",
      },
    }
  }

  const lineItems = attachOverridesToLineInputs(args.lineItems, args.overrideRows)
  const financials = computeCampaignFinancials(
    lineItems,
    { feeLoading: args.feeLoading },
    args.opts
  )
  const inputs_hash = computeBillingInputsHash(lineItems)
  const omitted = clientScheduleOmitted(args.clientBillingSchedule)

  const sumViolations = validateManualOverrideSumRules({ lineItems, financials })
  if (sumViolations.length > 0) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "Manual / fee-override lines failed sum rules",
        code: "BILLING_OVERRIDE_SUM_VIOLATION",
        sumViolations,
      },
    }
  }

  if (omitted) {
    return {
      ok: true,
      billingSchedule: financials.billingSchedule,
      deliverySchedule: financials.deliverySchedule,
      inputs_hash,
      rebill_needed: false,
      financials,
      generatedFromServer: true,
    }
  }

  const clientSchedule = coerceClientBillingSchedule(args.clientBillingSchedule)
  if (clientSchedule.length === 0) {
    // Unparseable payload — treat as omit and generate.
    return {
      ok: true,
      billingSchedule: financials.billingSchedule,
      deliverySchedule: financials.deliverySchedule,
      inputs_hash,
      rebill_needed: false,
      financials,
      generatedFromServer: true,
    }
  }

  const lineDeltas = compareAutoLines({
    clientSchedule,
    lineItems,
    financials,
  })

  // Campaign media+fee gate catches stale month headers (e.g. krusty004 fee $9k
  // vs recompute $14k). Adserving/production are omitted — those need rates not
  // always available on the save path and are not the C1 stale-schedule failure.
  const clientTotal = scheduleMediaFeeTotal(clientSchedule)
  const serverTotal = scheduleMediaFeeTotal(financials.billingSchedule)
  const totalDelta = roundMoney2(clientTotal - serverTotal)

  if (lineDeltas.length > 0 || exceedsTolerance(clientTotal, serverTotal)) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "Client billing schedule AUTO lines diverge from server recompute",
        code: "BILLING_SCHEDULE_DIVERGENCE",
        delta: {
          lines: lineDeltas,
          totalDeltaExGst: totalDelta,
        },
      },
    }
  }

  return {
    ok: true,
    // Keep client shape (manual modes / stamps) once AUTO equality holds.
    billingSchedule: clientSchedule,
    deliverySchedule: financials.deliverySchedule,
    inputs_hash,
    rebill_needed: false,
    financials,
    generatedFromServer: false,
  }
}
