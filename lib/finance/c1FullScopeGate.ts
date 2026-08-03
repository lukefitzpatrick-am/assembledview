/**
 * Plan C S1-P2 ΓÇö C1 full-scope billable=MBA gate (media + fee + adserving + production).
 *
 * Behind PLANC_C1_FULL_SCOPE=off|log|enforce. Core media/fee AUTO gate stays unchanged;
 * this module only adds adserving / production / campaign-total checks.
 */

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { computeAdServingCost } from "@/lib/billing/computeAdServingCost"
import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import {
  computeBillableAlignedMbaTotalExGst,
  monthExGstFromScheduleEntry,
} from "@/lib/finance/computeBillableAlignedMbaTotal"
import type {
  CampaignFinancials,
  LineItemInput,
} from "@/lib/finance/campaignFinancials.types"
import type { ComputeCampaignFinancialsOpts } from "@/lib/finance/computeCampaignFinancials"
import { formatAUD, roundMoney2 } from "@/lib/format/money"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

export const PLANC_C1_FULLSCOPE_LOG_PREFIX = "[planc-c1-fullscope]"
export const PLANC_C1_FULL_SCOPE_TOLERANCE = 0.01

export type PlanCC1FullScopeMode = "off" | "log" | "enforce"

export type FullScopeField = "adserving" | "production" | "campaign_total"

export type FullScopeDelta = {
  lineItemId: string
  field: FullScopeField
  clientTotal: number
  serverTotal: number
  delta: number
  /** Display label for humanise copy (falls back to lineItemId). */
  label?: string
}

export type FullScopeGateMeta = {
  mba_number?: string | number
  version?: string | number
}

function exceedsTolerance(a: number, b: number, tol = PLANC_C1_FULL_SCOPE_TOLERANCE): boolean {
  return Math.abs(a - b) > tol
}

function parseMonthMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney2(value)
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""))
  return roundMoney2(Number.isFinite(n) ? n : 0)
}

export function resolvePlanCC1FullScopeMode(
  raw: string | undefined = process.env.PLANC_C1_FULL_SCOPE
): PlanCC1FullScopeMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "log" || v === "enforce") return v
  return "off"
}

/** Sum client per-line adServingMonthlyAmounts (and totalAdServingAmount fallback). */
export function collectClientAdServingByLine(
  months: BillingMonth[]
): Map<string, { total: number; label: string; hasStamp: boolean }> {
  const map = new Map<string, { total: number; label: string; hasStamp: boolean }>()
  for (const month of months) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items as BillingLineItem[]) {
        const id = toBillingOverrideLineItemId(String(item.id ?? "").trim())
        if (!id) continue
        const stamped = item.adServingMonthlyAmounts != null
        const monthAmt = Number(item.adServingMonthlyAmounts?.[month.monthYear] ?? 0) || 0
        const existing = map.get(id)
        const label =
          [item.header1, item.header2].filter(Boolean).join(" — ").trim() || id
        if (existing) {
          existing.total = roundMoney2(existing.total + monthAmt)
          existing.hasStamp = existing.hasStamp || stamped
        } else {
          map.set(id, {
            total: roundMoney2(monthAmt),
            label,
            hasStamp: stamped,
          })
        }
      }
    }
  }
  // Prefer totalAdServingAmount when months were empty but total is stamped.
  for (const month of months) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items as BillingLineItem[]) {
        const id = toBillingOverrideLineItemId(String(item.id ?? "").trim())
        if (!id) continue
        const existing = map.get(id)
        if (!existing) continue
        if (
          existing.hasStamp &&
          existing.total === 0 &&
          typeof item.totalAdServingAmount === "number" &&
          Number.isFinite(item.totalAdServingAmount)
        ) {
          existing.total = roundMoney2(item.totalAdServingAmount)
        }
      }
    }
  }
  return map
}

/** Production media-type line monthlyAmounts totals from client schedule. */
export function collectClientProductionByLine(
  months: BillingMonth[]
): Map<string, { total: number; label: string }> {
  const map = new Map<string, { total: number; label: string }>()
  for (const month of months) {
    const prodItems = month.lineItems?.production
    if (!Array.isArray(prodItems)) continue
    for (const item of prodItems as BillingLineItem[]) {
      const id = toBillingOverrideLineItemId(String(item.id ?? "").trim())
      if (!id) continue
      const amt = Number(item.monthlyAmounts?.[month.monthYear] ?? 0) || 0
      const label =
        [item.header1, item.header2].filter(Boolean).join(" — ").trim() || id
      const existing = map.get(id)
      if (existing) {
        existing.total = roundMoney2(existing.total + amt)
      } else {
        map.set(id, { total: roundMoney2(amt), label })
      }
    }
  }
  return map
}

/**
 * Expected ad-serving $ per line ΓÇö mirrors computeSchedule.distributeAdServing
 * using line bursts + opts rates.
 */
export function computeExpectedAdServingByLine(
  lineItems: LineItemInput[],
  opts?: ComputeCampaignFinancialsOpts
): Map<string, number> {
  const getRate = opts?.getRateForMediaType ?? (() => 0)
  const adservaudio = opts?.adservaudio ?? 0
  const map = new Map<string, number>()
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ] as const

  for (const line of lineItems) {
    if (line.approval === "excluded") continue
    const canonId = toBillingOverrideLineItemId(line.lineItemId)
    if (line.noAdserving) {
      map.set(canonId, 0)
      continue
    }
    const mediaType = String(line.mediaType ?? "")
    const monthKeys = new Set<string>()
    for (const burst of line.bursts ?? []) {
      const start = new Date(burst.startDate as string | Date)
      const end = new Date(burst.endDate as string | Date)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
      let cur = new Date(start.getFullYear(), start.getMonth(), 1)
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
      while (cur <= endMonth) {
        monthKeys.add(`${MONTH_NAMES[cur.getMonth()]} ${cur.getFullYear()}`)
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
    }
    const keys = [...monthKeys]
    let total = 0
    for (const burst of line.bursts ?? []) {
      const startDate = new Date(burst.startDate as string | Date)
      const endDate = new Date(burst.endDate as string | Date)
      const deliverables =
        typeof burst.deliverables === "number" && Number.isFinite(burst.deliverables)
          ? burst.deliverables
          : 0
      const buyTypeLower = String(line.buyType || "").toLowerCase()
      const isFixed =
        buyTypeLower === "fixed cost" ||
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "fixedcost"

      if (isFixed) {
        // Fixed-cost: charge once from impressions override (do not prorate-multiply).
        total += computeAdServingCost({
          quantity: 0,
          buyType: line.buyType || "",
          mediaType,
          rate: getRate(mediaType),
          adservaudio,
          adServingRatePct: burst.adServingRatePct,
          adServingImpressions: burst.adServingImpressions,
        })
        continue
      }

      if (deliverables <= 0 || keys.length === 0) continue
      const shares = prorateAcrossMonths({
        amount: deliverables,
        burstStart: startDate,
        burstEnd: endDate,
        monthKeys: keys,
      })
      for (const [, share] of Object.entries(shares)) {
        total += computeAdServingCost({
          quantity: share,
          buyType: line.buyType || "",
          mediaType,
          rate: getRate(mediaType),
          adservaudio,
          adServingRatePct: burst.adServingRatePct,
          adServingImpressions: burst.adServingImpressions,
        })
      }
    }
    map.set(canonId, roundMoney2(total))
  }
  return map
}

function scheduleFullScopeTotal(months: BillingMonth[]): number {
  return roundMoney2(
    months.reduce(
      (s, m) => s + monthExGstFromScheduleEntry(m as unknown as Record<string, unknown>),
      0
    )
  )
}

/**
 * Full-scope deltas beyond today's media+fee AUTO gate.
 * Client-pays media is handled like validateBillableEqualsMba / computeBillableAlignedMbaTotal:
 * billable MBA subtracts client-pays media; billing headers already fee-only for those lines.
 */
export function collectFullScopeDeltas(args: {
  clientSchedule: BillingMonth[]
  lineItems: LineItemInput[]
  financials: CampaignFinancials
  opts?: ComputeCampaignFinancialsOpts
  /** Optional version bag for computeBillableAlignedMbaTotalExGst client-pays subtract. */
  version?: Record<string, unknown>
}): FullScopeDelta[] {
  const deltas: FullScopeDelta[] = []
  const inputById = new Map(
    args.lineItems.map((l) => [toBillingOverrideLineItemId(l.lineItemId), l])
  )
  const labelFor = (id: string, fallback?: string) =>
    String(inputById.get(toBillingOverrideLineItemId(id))?.label ?? "").trim() ||
    fallback ||
    id

  // --- Per-line adserving (only when client stamped adServingMonthlyAmounts) ---
  const clientAds = collectClientAdServingByLine(args.clientSchedule)
  const serverAds = computeExpectedAdServingByLine(args.lineItems, args.opts)
  // Also use month-header server total as campaign fallback when no per-line stamps.
  const serverHeaderAds = roundMoney2(
    args.financials.billingSchedule.reduce(
      (s, m) => s + parseMonthMoney(m.adservingTechFees),
      0
    )
  )

  if (clientAds.size > 0) {
    for (const [id, client] of clientAds) {
      if (!client.hasStamp) continue
      const server = serverAds.get(id)
      // Skip when we have no expected rate path and server expects 0 and client is 0.
      const serverTotal =
        server != null
          ? server
          : // Fall back: allocate header proportionally only when single stamped line.
            clientAds.size === 1
            ? serverHeaderAds
            : 0
      if (exceedsTolerance(client.total, serverTotal)) {
        deltas.push({
          lineItemId: id,
          field: "adserving",
          clientTotal: client.total,
          serverTotal,
          delta: roundMoney2(client.total - serverTotal),
          label: labelFor(id, client.label),
        })
      }
    }
  } else {
    // No per-line stamps ΓÇö compare month headers for adserving.
    const clientHeaderAds = roundMoney2(
      args.clientSchedule.reduce((s, m) => s + parseMonthMoney(m.adservingTechFees), 0)
    )
    if (exceedsTolerance(clientHeaderAds, serverHeaderAds)) {
      deltas.push({
        lineItemId: "*",
        field: "adserving",
        clientTotal: clientHeaderAds,
        serverTotal: serverHeaderAds,
        delta: roundMoney2(clientHeaderAds - serverHeaderAds),
        label: "Ad serving",
      })
    }
  }

  // --- Per-line production (production media-type rows) ---
  const clientProd = collectClientProductionByLine(args.clientSchedule)
  const perLineById = new Map(
    args.financials.perLine.map((p) => [toBillingOverrideLineItemId(p.lineItemId), p])
  )
  if (clientProd.size > 0) {
    for (const [id, client] of clientProd) {
      const pl = perLineById.get(toBillingOverrideLineItemId(id))
      if (pl?.flags.excluded) continue
      const serverTotal = pl
        ? roundMoney2(pl.billingMonths.reduce((s, m) => s + m.amount, 0))
        : roundMoney2(
            args.financials.billingSchedule.reduce(
              (s, m) => s + parseMonthMoney(m.production),
              0
            )
          )
      if (exceedsTolerance(client.total, serverTotal)) {
        deltas.push({
          lineItemId: id,
          field: "production",
          clientTotal: client.total,
          serverTotal,
          delta: roundMoney2(client.total - serverTotal),
          label: labelFor(id, client.label),
        })
      }
    }
  } else {
    const clientHeaderProd = roundMoney2(
      args.clientSchedule.reduce((s, m) => s + parseMonthMoney(m.production), 0)
    )
    const serverHeaderProd = roundMoney2(
      args.financials.billingSchedule.reduce((s, m) => s + parseMonthMoney(m.production), 0)
    )
    if (exceedsTolerance(clientHeaderProd, serverHeaderProd)) {
      deltas.push({
        lineItemId: "*",
        field: "production",
        clientTotal: clientHeaderProd,
        serverTotal: serverHeaderProd,
        delta: roundMoney2(clientHeaderProd - serverHeaderProd),
        label: "Production",
      })
    }
  }

  // --- Full-scope campaign total (media+fee+ads+prod, client-pays aligned) ---
  // Same basis as computeBillableAlignedMbaTotalExGst / validateBillableEqualsMba:
  // delivery month ex-GST totals minus client-pays media. Prefer reconciliation's
  // clientPaysMedia (from line inputs) so we don't depend on channel rows on `version`.
  const clientFull = scheduleFullScopeTotal(args.clientSchedule)
  const delivery = args.financials.deliverySchedule ?? []
  const clientPaysMedia = roundMoney2(args.financials.reconciliation?.clientPaysMedia ?? 0)
  const version = args.version ?? {}

  const alignedFromHelper = computeBillableAlignedMbaTotalExGst({
    deliveryMonths: delivery.map((m) => m as unknown as Record<string, unknown>),
    billingMonths: args.financials.billingSchedule.map(
      (m) => m as unknown as Record<string, unknown>
    ),
    version,
  })
  const deliveryFull = scheduleFullScopeTotal(delivery.length ? delivery : args.financials.billingSchedule)
  // When the helper couldn't see client-pays rows, force the known subtract.
  const serverTarget =
    clientPaysMedia > 0.005 && Math.abs(alignedFromHelper - deliveryFull) <= PLANC_C1_FULL_SCOPE_TOLERANCE
      ? roundMoney2(deliveryFull - clientPaysMedia)
      : clientPaysMedia > 0.005
        ? roundMoney2(Math.min(alignedFromHelper, deliveryFull - clientPaysMedia))
        : roundMoney2(alignedFromHelper)

  if (exceedsTolerance(clientFull, serverTarget)) {
    deltas.push({
      lineItemId: "*",
      field: "campaign_total",
      clientTotal: clientFull,
      serverTotal: serverTarget,
      delta: roundMoney2(clientFull - serverTarget),
      label: "Campaign total",
    })
  }

  return deltas
}

export function formatFullScopeUserMessage(deltas: FullScopeDelta[]): string {
  if (deltas.length === 0) return ""
  const lines = deltas.map((d) => {
    const abs = formatAUD(Math.abs(d.delta))
    const name = d.label || d.lineItemId
    switch (d.field) {
      case "adserving":
        return d.lineItemId === "*"
          ? `Ad serving differs from the approved MBA by ${abs}`
          : `Ad serving on line ${name} differs from the approved MBA by ${abs}`
      case "production":
        return d.lineItemId === "*"
          ? `Production differs from the approved MBA by ${abs}`
          : `Production on line ${name} differs from the approved MBA by ${abs}`
      case "campaign_total":
        return `The full billing total (media + fee + ad serving + production) differs from the approved MBA by ${abs}`
      default:
        return `${name} differs from the approved MBA by ${abs}`
    }
  })
  return lines.join("\n")
}

/**
 * Apply PLANC_C1_FULL_SCOPE after the classic media+fee gate has passed.
 * - off: no-op
 * - log: console structured lines, never fail
 * - enforce: return deltas for 409
 */
export function applyC1FullScopeGate(args: {
  mode: PlanCC1FullScopeMode
  clientSchedule: BillingMonth[]
  lineItems: LineItemInput[]
  financials: CampaignFinancials
  opts?: ComputeCampaignFinancialsOpts
  version?: Record<string, unknown>
  meta?: FullScopeGateMeta
}): { deltas: FullScopeDelta[]; shouldReject: boolean } {
  if (args.mode === "off") {
    return { deltas: [], shouldReject: false }
  }

  const deltas = collectFullScopeDeltas({
    clientSchedule: args.clientSchedule,
    lineItems: args.lineItems,
    financials: args.financials,
    opts: args.opts,
    version: args.version,
  })

  if (args.mode === "log") {
    for (const d of deltas) {
      console.log(
        PLANC_C1_FULLSCOPE_LOG_PREFIX,
        JSON.stringify({
          mba_number: args.meta?.mba_number ?? null,
          version: args.meta?.version ?? null,
          line: d.lineItemId,
          component: d.field,
          delta: d.delta,
          clientTotal: d.clientTotal,
          serverTotal: d.serverTotal,
          label: d.label ?? null,
        })
      )
    }
    return { deltas, shouldReject: false }
  }

  // enforce
  return { deltas, shouldReject: deltas.length > 0 }
}
