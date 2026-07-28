/**
 * Plan C S1 — server-side financial authority behind PLANC_SERVER_AUTHORITY.
 *
 * - off: caller keeps current (client) persist shape — byte-identical.
 * - log: persist client shape; log structured diff when server ≠ client beyond $0.01.
 * - enforce: persist server compute result (manual timing via billing_overrides attach).
 */

import type { BillingMonth, BillingLineItem } from "@/lib/billing/types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type {
  CampaignFinancialsValidation,
  FeeLoading,
  LineItemInput,
  MbaScopeTotals,
  PerLineResult,
} from "@/lib/finance/campaignFinancials.types"
import { roundMoney2 } from "@/lib/format/money"
import {
  assembleCampaignFinancialsWithOverrides,
  buildComputeOptsFromAuthorityArgs,
} from "@/lib/finance/authority/assembleWithOverrides"

export const PLANC_AUTHORITY_DIFF_PREFIX = "[planc-authority-diff]"
export const PLANC_AUTHORITY_TOLERANCE = 0.01

export type PlanCServerAuthorityMode = "off" | "log" | "enforce"

export type ComputeAuthoritativeFinancialsArgs = {
  lineItems: LineItemInput[]
  feeLoading: FeeLoading
  /** Partial-MBA approval selection (selected months). */
  approvalState?: { selectedMonthYears?: readonly string[] }
  monthScope?: {
    campaignStart?: Date
    campaignEnd?: Date
    selectedMonthYears?: readonly string[]
  }
  /** Rows from billing_overrides — attached inside this module (required for enforce). */
  overrides: BillingOverrideRow[]
  /** Extra schedule compute knobs (adserving rates etc.). */
  client?: {
    adservaudio?: number
    getRateForMediaType?: (mediaType: string) => number
    isManualBilling?: boolean
  }
}

export type AuthoritativeFinancials = {
  billingSchedule: BillingMonth[]
  deliverySchedule: BillingMonth[]
  totals: MbaScopeTotals
  perLine: PerLineResult[]
  validation: CampaignFinancialsValidation
  /** Attached line inputs (overrides applied) — useful for tests / C1 parity. */
  lineItems: LineItemInput[]
}

export type AuthorityScheduleDiffLine = {
  lineItemId: string
  monthYear: string
  field: "media" | "fee"
  client: number
  server: number
  delta: number
}

export type AuthorityScheduleDiff = {
  mba_number?: string
  version?: string | number
  lines: AuthorityScheduleDiffLine[]
  monthDeltas: Array<{
    monthYear: string
    field: "media" | "fee"
    client: number
    server: number
    delta: number
  }>
}

export type ApplyPlanCServerAuthorityArgs = {
  mode: PlanCServerAuthorityMode
  /** What C1 (or the client) would persist today for billing. */
  clientBillingSchedule: BillingMonth[]
  clientDeliverySchedule: BillingMonth[] | unknown
  authoritative: AuthoritativeFinancials
  meta?: { mba_number?: string; version?: string | number }
}

export type ApplyPlanCServerAuthorityResult = {
  billingSchedule: BillingMonth[]
  deliverySchedule: BillingMonth[]
  /** True when a structured diff was emitted to console (log mode only). */
  diffLogged: boolean
  diff: AuthorityScheduleDiff | null
}

function exceedsTolerance(a: number, b: number, tol = PLANC_AUTHORITY_TOLERANCE): boolean {
  return Math.abs(a - b) > tol
}

function parseMonthMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney2(value)
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""))
  return roundMoney2(Number.isFinite(n) ? n : 0)
}

export function resolvePlanCServerAuthorityMode(
  raw: string | undefined = process.env.PLANC_SERVER_AUTHORITY
): PlanCServerAuthorityMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "log" || v === "enforce") return v
  return "off"
}

/**
 * Runs computeCampaignFinancials exactly as C1 does (shared assemble helper),
 * returning the persist shape the PUT/PATCH routes write.
 */
export function computeAuthoritativeFinancials(
  args: ComputeAuthoritativeFinancialsArgs
): AuthoritativeFinancials {
  const opts = buildComputeOptsFromAuthorityArgs({
    approvalState: args.approvalState,
    monthScope: args.monthScope,
    client: args.client,
  })
  const { lineItems, financials } = assembleCampaignFinancialsWithOverrides({
    lineItems: args.lineItems,
    feeLoading: args.feeLoading,
    overrideRows: args.overrides,
    opts,
  })
  return {
    billingSchedule: financials.billingSchedule,
    deliverySchedule: financials.deliverySchedule,
    totals: financials.mbaScopeTotals,
    perLine: financials.perLine,
    validation: financials.validation,
    lineItems,
  }
}

function collectClientLineMonthAmounts(
  months: BillingMonth[]
): Map<string, { media: number; fee: number }> {
  /** key = `${lineId}::${monthYear}` */
  const map = new Map<string, { media: number; fee: number }>()
  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const items of Object.values(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items as BillingLineItem[]) {
        const id = String(item.id ?? "").trim()
        if (!id) continue
        const key = `${id}::${month.monthYear}`
        const media = Number(item.monthlyAmounts?.[month.monthYear] ?? 0) || 0
        const fee = Number(item.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
        const existing = map.get(key)
        if (existing) {
          existing.media = roundMoney2(existing.media + media)
          existing.fee = roundMoney2(existing.fee + fee)
        } else {
          map.set(key, { media: roundMoney2(media), fee: roundMoney2(fee) })
        }
      }
    }
  }
  return map
}

/**
 * Compare client billing schedule vs authoritative result beyond $0.01.
 * Returns null when within tolerance (no actionable diff).
 */
export function diffClientVsAuthoritySchedule(
  clientSchedule: BillingMonth[],
  authoritative: AuthoritativeFinancials,
  meta?: { mba_number?: string; version?: string | number }
): AuthorityScheduleDiff | null {
  const monthDeltas: AuthorityScheduleDiff["monthDeltas"] = []
  const serverByMonth = new Map(
    authoritative.billingSchedule.map((m) => [m.monthYear, m] as const)
  )
  const clientByMonth = new Map(clientSchedule.map((m) => [m.monthYear, m] as const))
  const allMonths = new Set([...serverByMonth.keys(), ...clientByMonth.keys()])

  for (const monthYear of [...allMonths].sort()) {
    const client = clientByMonth.get(monthYear)
    const server = serverByMonth.get(monthYear)
    const clientMedia = parseMonthMoney(client?.mediaTotal)
    const serverMedia = parseMonthMoney(server?.mediaTotal)
    const clientFee = parseMonthMoney(client?.feeTotal)
    const serverFee = parseMonthMoney(server?.feeTotal)
    if (exceedsTolerance(clientMedia, serverMedia)) {
      monthDeltas.push({
        monthYear,
        field: "media",
        client: clientMedia,
        server: serverMedia,
        delta: roundMoney2(clientMedia - serverMedia),
      })
    }
    if (exceedsTolerance(clientFee, serverFee)) {
      monthDeltas.push({
        monthYear,
        field: "fee",
        client: clientFee,
        server: serverFee,
        delta: roundMoney2(clientFee - serverFee),
      })
    }
  }

  const lines: AuthorityScheduleDiffLine[] = []
  const clientLineMonths = collectClientLineMonthAmounts(clientSchedule)
  if (clientLineMonths.size > 0) {
    for (const pl of authoritative.perLine) {
      if (pl.flags.excluded) continue
      for (const bm of pl.billingMonths) {
        const key = `${pl.lineItemId}::${bm.month}`
        const client = clientLineMonths.get(key)
        // Only compare when client schedule stamped this line/month.
        if (!client) continue
        if (exceedsTolerance(client.media, bm.amount)) {
          lines.push({
            lineItemId: pl.lineItemId,
            monthYear: bm.month,
            field: "media",
            client: client.media,
            server: bm.amount,
            delta: roundMoney2(client.media - bm.amount),
          })
        }
      }
      // Fee: compare total when client stamped fee months for the line.
      const clientFeeTotal = roundMoney2(
        [...clientLineMonths.entries()]
          .filter(([k]) => k.startsWith(`${pl.lineItemId}::`))
          .reduce((s, [, v]) => s + v.fee, 0)
      )
      const hasFeeStamp = [...clientLineMonths.entries()].some(
        ([k, v]) => k.startsWith(`${pl.lineItemId}::`) && Math.abs(v.fee) > 0
      )
      if (hasFeeStamp && exceedsTolerance(clientFeeTotal, pl.fee)) {
        lines.push({
          lineItemId: pl.lineItemId,
          monthYear: "*",
          field: "fee",
          client: clientFeeTotal,
          server: pl.fee,
          delta: roundMoney2(clientFeeTotal - pl.fee),
        })
      }
    }
  }

  if (monthDeltas.length === 0 && lines.length === 0) return null
  return {
    mba_number: meta?.mba_number,
    version: meta?.version,
    lines,
    monthDeltas,
  }
}

/**
 * Decide what to persist under PLANC_SERVER_AUTHORITY.
 * Manual timing survives enforce because overrides are attached inside
 * {@link computeAuthoritativeFinancials} before compute.
 */
export function applyPlanCServerAuthority(
  args: ApplyPlanCServerAuthorityArgs
): ApplyPlanCServerAuthorityResult {
  const { mode, clientBillingSchedule, authoritative, meta } = args
  const clientDelivery = Array.isArray(args.clientDeliverySchedule)
    ? (args.clientDeliverySchedule as BillingMonth[])
    : authoritative.deliverySchedule

  if (mode === "off") {
    return {
      billingSchedule: clientBillingSchedule,
      deliverySchedule: clientDelivery,
      diffLogged: false,
      diff: null,
    }
  }

  const diff = diffClientVsAuthoritySchedule(clientBillingSchedule, authoritative, meta)

  if (mode === "log") {
    let diffLogged = false
    if (diff) {
      console.log(
        PLANC_AUTHORITY_DIFF_PREFIX,
        JSON.stringify({
          mba_number: diff.mba_number ?? null,
          version: diff.version ?? null,
          lineIds: [...new Set(diff.lines.map((l) => l.lineItemId))],
          monthDeltas: diff.monthDeltas,
          lineDeltas: diff.lines,
        })
      )
      diffLogged = true
    }
    return {
      billingSchedule: clientBillingSchedule,
      deliverySchedule: clientDelivery,
      diffLogged,
      diff,
    }
  }

  // enforce — persist server schedules; manual months already in authority output.
  return {
    billingSchedule: authoritative.billingSchedule,
    deliverySchedule: authoritative.deliverySchedule,
    diffLogged: false,
    diff,
  }
}
