/**
 * Plan C S2-P2 — materialise authority schedules as typed billing/delivery rows.
 *
 * Pure: (authorityResult, lineItems, overrides) → { billingRows, deliveryRows }.
 * One row per (line_uid, month); media/fee/adserving as columns (exactly once).
 */

import { computeAdServingCost } from "@/lib/billing/computeAdServingCost"
import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import type { AuthoritativeFinancials } from "@/lib/finance/authority/computeAndPersist"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type { LineItemInput, MonthAmount, PerLineResult } from "@/lib/finance/campaignFinancials.types"
import {
  normaliseScheduleMediaType,
  scheduleMonthYearToIso,
} from "@/lib/finance/computeCampaignFinancials"
import type {
  PlanBillingRow,
  PlanBillingRowSource,
  PlanDeliveryRow,
  PlanRowLineSource,
} from "@/lib/finance/rows/types"
import { roundMoney2 } from "@/lib/format/money"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { ensureLineUids, pickLineUid } from "@/lib/mediaplan/lineUid"

export type BuildRowsMeta = {
  media_plan_version: number
  mba_number: string
}

export type BuildRowsAdservingOpts = {
  getRateForMediaType?: (mediaType: string) => number
  adservaudio?: number
}

export type BuildRowsArgs = {
  authorityResult: AuthoritativeFinancials
  lineItems: LineItemInput[]
  overrides: BillingOverrideRow[]
  meta: BuildRowsMeta
  adserving?: BuildRowsAdservingOpts
}

export type BuildRowsResult = {
  billingRows: PlanBillingRow[]
  deliveryRows: PlanDeliveryRow[]
}

type MonthBucket = {
  media: number
  /** Billing-schedule fee timing (honours feeOverride). */
  feeBilling: number
  /** Delivery-schedule fee timing (auto burst prorate only). */
  feeDelivery: number
  adserving: number
  deliveryMedia: number
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toDate(value: string | Date | undefined, fallback: Date): Date {
  return coerceBurstDateLocal(value) ?? fallback
}

function monthMapFromAmounts(months: MonthAmount[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of months) {
    const iso = scheduleMonthYearToIso(String(m.month ?? "").trim())
    if (!iso) continue
    map.set(iso, roundMoney2((map.get(iso) ?? 0) + (Number(m.amount) || 0)))
  }
  return map
}

function allocateProportional(
  total: number,
  weights: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>()
  if (Math.abs(total) < 1e-9) return out
  const entries = [...weights.entries()].filter(([, w]) => Math.abs(w) > 1e-9)
  const weightSum = entries.reduce((s, [, w]) => s + w, 0)
  if (Math.abs(weightSum) < 1e-9) return out
  let allocated = 0
  entries.forEach(([month, w], idx) => {
    if (idx === entries.length - 1) {
      out.set(month, roundMoney2(total - allocated))
    } else {
      const share = roundMoney2(total * (w / weightSum))
      out.set(month, share)
      allocated = roundMoney2(allocated + share)
    }
  })
  return out
}

/** Auto fee shares from bursts (delivery + pre-override billing timing). */
function autoFeeSharesFromBursts(
  line: LineItemInput,
  monthKeys: string[]
): Map<string, number> {
  const feePct = typeof line.feePct === "number" ? line.feePct : 0
  const feeShares: Record<string, number> = {}
  const bursts =
    line.bursts && line.bursts.length > 0
      ? line.bursts
      : [
          {
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            budget: line.enteredAmount,
          },
        ]

  for (const burst of bursts) {
    const amounts = computeBurstAmounts({
      rawBudget: parseAmount(burst.budget ?? burst.buyAmount),
      budgetIncludesFees: Boolean(line.budgetIncludesFees),
      clientPaysForMedia: Boolean(line.clientPaysForMedia),
      feePct,
      buyType: line.buyType,
    })
    const shares = prorateAcrossMonths({
      amount: amounts.feeAmount,
      burstStart: toDate(burst.startDate as string | Date, new Date()),
      burstEnd: toDate(burst.endDate as string | Date, new Date()),
      monthKeys,
    })
    for (const [m, v] of Object.entries(shares)) {
      feeShares[m] = (feeShares[m] ?? 0) + v
    }
  }
  return monthMapFromAmounts(
    Object.entries(feeShares).map(([month, amount]) => ({ month, amount }))
  )
}

function billingFeeMonthsForLine(
  line: LineItemInput,
  perLine: PerLineResult,
  monthKeys: string[]
): Map<string, number> {
  if (line.feeOverride?.mode === "manual" && line.feeOverride.months?.length) {
    return monthMapFromAmounts(line.feeOverride.months)
  }

  const fromBursts = autoFeeSharesFromBursts(line, monthKeys)
  const feeTotal = roundMoney2(perLine.fee)
  const burstSum = roundMoney2([...fromBursts.values()].reduce((s, v) => s + v, 0))
  if (Math.abs(feeTotal - burstSum) <= 0.02) return fromBursts
  if (burstSum > 0.005) {
    const scaled = new Map<string, number>()
    for (const [m, v] of fromBursts) {
      scaled.set(m, roundMoney2((v / burstSum) * feeTotal))
    }
    return scaled
  }
  return allocateProportional(feeTotal, monthMapFromAmounts(perLine.deliveryMonths))
}

const ADSERVING_MEDIA_TYPES = new Set([
  "digiAudio",
  "digiDisplay",
  "digiVideo",
  "bvod",
  "progAudio",
  "progVideo",
  "progBvod",
  "progOoh",
  "progDisplay",
])

function adservingMonthsForLine(
  line: LineItemInput,
  monthKeys: string[],
  adserving?: BuildRowsAdservingOpts
): Map<string, number> {
  if (line.noAdserving) return new Map()
  const mediaType = normaliseScheduleMediaType(line.mediaType)
  if (!ADSERVING_MEDIA_TYPES.has(mediaType)) return new Map()
  const getRate = adserving?.getRateForMediaType ?? (() => 0)
  const adservaudio = adserving?.adservaudio ?? 0
  const shares: Record<string, number> = {}

  for (const burst of line.bursts ?? []) {
    if (!burst) continue
    const startDate = toDate(burst.startDate as string | Date, new Date())
    const endDate = toDate(burst.endDate as string | Date, startDate)
    const buyType = String(line.buyType || "").toLowerCase()
    let quantity = 0
    if (buyType === "cpm" || buyType === "bonus" || buyType === "package_inclusions") {
      const rawBudget = parseAmount(burst.budget)
      const rate = parseAmount(burst.buyAmount) || line.rate || 0
      quantity =
        typeof burst.deliverables === "number"
          ? burst.deliverables
          : rate > 0
            ? (rawBudget / rate) * 1000
            : 0
    } else if (typeof burst.deliverables === "number") {
      quantity = burst.deliverables
    } else if (typeof burst.calculatedValue === "number") {
      quantity = burst.calculatedValue
    }

    const deliverableShares = prorateAcrossMonths({
      amount: quantity,
      burstStart: startDate,
      burstEnd: endDate,
      monthKeys,
    })

    for (const [monthKey, share] of Object.entries(deliverableShares)) {
      if (!share) continue
      const cost = computeAdServingCost({
        quantity: share,
        buyType: line.buyType || "",
        mediaType,
        rate: getRate(mediaType),
        adservaudio,
        adServingRatePct: burst.adServingRatePct,
        adServingImpressions: burst.adServingImpressions,
      })
      shares[monthKey] = (shares[monthKey] ?? 0) + cost
    }
  }

  return monthMapFromAmounts(
    Object.entries(shares).map(([month, amount]) => ({ month, amount }))
  )
}

function overrideIdForLine(
  lineItemId: string,
  overrides: BillingOverrideRow[]
): number | null {
  for (const row of overrides) {
    const id = String(row.line_item_id ?? row.lineItemId ?? "").trim()
    if (id !== lineItemId) continue
    if (row.id == null || row.id === "") continue
    const n = Number(row.id)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Per-month source: honour MonthAmount.source=balancing when present on the override. */
function resolveSourceForMonth(
  isManual: boolean,
  monthIso: string,
  overrideMonths: MonthAmount[] | undefined
): PlanBillingRowSource {
  if (!isManual) return "auto"
  if (overrideMonths?.length) {
    const hit = overrideMonths.find((m) => {
      const key = String(m.month ?? "").trim()
      return key === monthIso || scheduleMonthYearToIso(key) === monthIso
    })
    if (hit?.source === "balancing") return "balancing"
  }
  return "manual"
}

function lineSourceFor(mediaType: string): PlanRowLineSource {
  return normaliseScheduleMediaType(mediaType) === "production"
    ? "production"
    : "channel"
}

/**
 * Build flattened plan_*_rows from authoritative financials.
 * Mints missing line_uids defensively (never remints).
 */
export function buildRows(args: BuildRowsArgs): BuildRowsResult {
  const { authorityResult, overrides, meta, adserving } = args
  const lineItems = ensureLineUids(args.lineItems ?? [])
  const byId = new Map(lineItems.map((l) => [String(l.lineItemId), l]))

  const monthKeys = [
    ...new Set([
      ...authorityResult.billingSchedule.map((m) => m.monthYear),
      ...authorityResult.deliverySchedule.map((m) => m.monthYear),
    ]),
  ]
  if (monthKeys.length === 0) {
    return { billingRows: [], deliveryRows: [] }
  }

  const billingRows: PlanBillingRow[] = []
  const deliveryRows: PlanDeliveryRow[] = []

  for (const perLine of authorityResult.perLine) {
    if (perLine.flags.excluded) continue
    const line = byId.get(String(perLine.lineItemId))
    if (!line) continue
    const line_uid = pickLineUid(line)
    if (!line_uid) continue

    const mediaByMonth = monthMapFromAmounts(perLine.billingMonths)
    const deliveryByMonth = monthMapFromAmounts(perLine.deliveryMonths)
    const feeBillingByMonth = billingFeeMonthsForLine(line, perLine, monthKeys)
    const feeDeliveryByMonth = autoFeeSharesFromBursts(line, monthKeys)
    const adByMonth = adservingMonthsForLine(line, monthKeys, adserving)

    const months = new Set<string>([
      ...mediaByMonth.keys(),
      ...deliveryByMonth.keys(),
      ...feeBillingByMonth.keys(),
      ...feeDeliveryByMonth.keys(),
      ...adByMonth.keys(),
    ])

    const isManual = perLine.flags.manualBilling || perLine.flags.manualFee
    const line_source = lineSourceFor(perLine.mediaType)
    const override_id = overrideIdForLine(perLine.lineItemId, overrides)
    const mediaOverrideMonths = line.billingOverride?.months

    for (const iso of months) {
      const bucket: MonthBucket = {
        media: roundMoney2(mediaByMonth.get(iso) ?? 0),
        feeBilling: roundMoney2(feeBillingByMonth.get(iso) ?? 0),
        feeDelivery: roundMoney2(feeDeliveryByMonth.get(iso) ?? 0),
        adserving: roundMoney2(adByMonth.get(iso) ?? 0),
        deliveryMedia: roundMoney2(deliveryByMonth.get(iso) ?? 0),
      }

      const media_amount = perLine.flags.clientPaysForMedia ? 0 : bucket.media
      const billable_amount = roundMoney2(
        media_amount + bucket.feeBilling + bucket.adserving
      )

      if (
        Math.abs(media_amount) > 1e-9 ||
        Math.abs(bucket.feeBilling) > 1e-9 ||
        Math.abs(bucket.adserving) > 1e-9
      ) {
        billingRows.push({
          media_plan_version: meta.media_plan_version,
          mba_number: meta.mba_number,
          line_uid,
          line_source,
          media_type: perLine.mediaType,
          month: iso,
          media_amount: roundMoney2(media_amount),
          fee_amount: roundMoney2(bucket.feeBilling),
          adserving_amount: roundMoney2(bucket.adserving),
          billable_amount,
          client_pays_for_media: perLine.flags.clientPaysForMedia,
          is_manual_override: isManual,
          source: resolveSourceForMonth(isManual, iso, mediaOverrideMonths),
          override_id: isManual ? override_id : null,
        })
      }

      const media_amount_full = roundMoney2(bucket.deliveryMedia)
      const delivery_amount = roundMoney2(
        media_amount_full + bucket.feeDelivery + bucket.adserving
      )

      if (
        Math.abs(media_amount_full) > 1e-9 ||
        Math.abs(bucket.feeDelivery) > 1e-9 ||
        Math.abs(bucket.adserving) > 1e-9
      ) {
        deliveryRows.push({
          media_plan_version: meta.media_plan_version,
          mba_number: meta.mba_number,
          line_uid,
          line_source,
          media_type: perLine.mediaType,
          month: iso,
          delivery_amount,
          media_amount_full,
        })
      }
    }
  }

  billingRows.sort((a, b) =>
    a.line_uid === b.line_uid
      ? a.month.localeCompare(b.month)
      : a.line_uid.localeCompare(b.line_uid)
  )
  deliveryRows.sort((a, b) =>
    a.line_uid === b.line_uid
      ? a.month.localeCompare(b.month)
      : a.line_uid.localeCompare(b.line_uid)
  )

  return { billingRows, deliveryRows }
}
