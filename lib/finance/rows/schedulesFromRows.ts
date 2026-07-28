/**
 * Plan C S2-P5 — rebuild BillingMonth[] schedules from typed plan_*_rows.
 * Pure / sync — no network.
 */

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { scheduleMonthYearToIso } from "@/lib/finance/computeCampaignFinancials"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"
import { roundMoney2 } from "@/lib/format/money"
import { formatAUD } from "@/lib/format/money"

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

const EMPTY_MEDIA_COSTS: BillingMonth["mediaCosts"] = {
  search: "$0.00",
  socialMedia: "$0.00",
  television: "$0.00",
  radio: "$0.00",
  newspaper: "$0.00",
  magazines: "$0.00",
  ooh: "$0.00",
  cinema: "$0.00",
  digiDisplay: "$0.00",
  digiAudio: "$0.00",
  digiVideo: "$0.00",
  bvod: "$0.00",
  integration: "$0.00",
  progDisplay: "$0.00",
  progVideo: "$0.00",
  progBvod: "$0.00",
  progAudio: "$0.00",
  progOoh: "$0.00",
  influencers: "$0.00",
  production: "$0.00",
}

export function isoMonthToMonthYear(iso: string): string | null {
  const m = String(iso ?? "").trim().match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function moneyStr(n: number): string {
  return formatAUD(roundMoney2(n))
}

function emptyCosts(): BillingMonth["mediaCosts"] {
  return { ...EMPTY_MEDIA_COSTS }
}

/**
 * Rebuild billing schedule months from plan_billing_rows.
 * line_uid is used as BillingLineItem.id (durable identity).
 */
export function billingMonthsFromPlanBillingRows(rows: PlanBillingRow[]): BillingMonth[] {
  type Agg = {
    monthYear: string
    media: number
    fee: number
    adserving: number
    production: number
    costs: Record<string, number>
    lines: Map<string, BillingLineItem>
  }
  const byMonth = new Map<string, Agg>()

  for (const row of rows) {
    const monthYear = isoMonthToMonthYear(row.month)
    if (!monthYear) continue
    let agg = byMonth.get(monthYear)
    if (!agg) {
      agg = {
        monthYear,
        media: 0,
        fee: 0,
        adserving: 0,
        production: 0,
        costs: {},
        lines: new Map(),
      }
      byMonth.set(monthYear, agg)
    }

    const media = roundMoney2(Number(row.media_amount) || 0)
    const fee = roundMoney2(Number(row.fee_amount) || 0)
    const ad = roundMoney2(Number(row.adserving_amount) || 0)
    const isProd = row.line_source === "production"
    if (isProd) {
      agg.production = roundMoney2(agg.production + media + fee + ad)
    } else {
      agg.media = roundMoney2(agg.media + media)
      agg.fee = roundMoney2(agg.fee + fee)
      agg.adserving = roundMoney2(agg.adserving + ad)
    }
    const mt = String(row.media_type || "search")
    agg.costs[mt] = roundMoney2((agg.costs[mt] ?? 0) + media)

    const lineKey = `${row.line_uid}::${mt}`
    let line = agg.lines.get(lineKey)
    if (!line) {
      line = {
        id: row.line_uid,
        header1: "",
        header2: "",
        monthlyAmounts: {},
        feeMonthlyAmounts: {},
        adServingMonthlyAmounts: {},
        totalAmount: 0,
        totalFeeAmount: 0,
        clientPaysForMedia: row.client_pays_for_media === true,
        billingMode: row.is_manual_override ? "manual" : "auto",
      }
      agg.lines.set(lineKey, line)
    }
    line.monthlyAmounts![monthYear] = roundMoney2(
      (line.monthlyAmounts![monthYear] ?? 0) + media
    )
    line.feeMonthlyAmounts![monthYear] = roundMoney2(
      (line.feeMonthlyAmounts![monthYear] ?? 0) + fee
    )
    line.adServingMonthlyAmounts![monthYear] = roundMoney2(
      (line.adServingMonthlyAmounts![monthYear] ?? 0) + ad
    )
    line.totalAmount = roundMoney2((line.totalAmount ?? 0) + media)
    line.totalFeeAmount = roundMoney2((line.totalFeeAmount ?? 0) + fee)
  }

  return [...byMonth.values()]
    .sort((a, b) => {
      const ai = scheduleMonthYearToIso(a.monthYear) ?? ""
      const bi = scheduleMonthYearToIso(b.monthYear) ?? ""
      return ai.localeCompare(bi)
    })
    .map((agg) => {
      const lineItems: BillingMonth["lineItems"] = {}
      for (const [key, line] of agg.lines) {
        const mt = key.split("::")[1] || "search"
        if (!lineItems[mt as keyof NonNullable<BillingMonth["lineItems"]>]) {
          ;(lineItems as Record<string, BillingLineItem[]>)[mt] = []
        }
        ;(lineItems as Record<string, BillingLineItem[]>)[mt].push(line)
      }
      const costs = emptyCosts()
      for (const [k, v] of Object.entries(agg.costs)) {
        if (k in costs) (costs as Record<string, string>)[k] = moneyStr(v)
      }
      if (agg.production > 0) costs.production = moneyStr(agg.production)
      const total = roundMoney2(agg.media + agg.fee + agg.adserving + agg.production)
      return {
        monthYear: agg.monthYear,
        mediaTotal: moneyStr(agg.media),
        feeTotal: moneyStr(agg.fee),
        adservingTechFees: moneyStr(agg.adserving),
        production: moneyStr(agg.production),
        totalAmount: moneyStr(total),
        mediaCosts: costs,
        lineItems,
      } satisfies BillingMonth
    })
}

/**
 * Rebuild delivery-shaped schedule months from plan_delivery_rows.
 * Non-media remainder (delivery_amount - media_amount_full) lands in feeTotal
 * (covers fee+adserving for pacing totals).
 */
export function billingMonthsFromPlanDeliveryRows(rows: PlanDeliveryRow[]): BillingMonth[] {
  type Agg = {
    monthYear: string
    media: number
    feeLike: number
    production: number
    costs: Record<string, number>
    lines: Map<string, BillingLineItem>
  }
  const byMonth = new Map<string, Agg>()

  for (const row of rows) {
    const monthYear = isoMonthToMonthYear(row.month)
    if (!monthYear) continue
    let agg = byMonth.get(monthYear)
    if (!agg) {
      agg = {
        monthYear,
        media: 0,
        feeLike: 0,
        production: 0,
        costs: {},
        lines: new Map(),
      }
      byMonth.set(monthYear, agg)
    }
    const mediaFull = roundMoney2(Number(row.media_amount_full) || 0)
    const delivery = roundMoney2(Number(row.delivery_amount) || 0)
    const remainder = roundMoney2(delivery - mediaFull)
    const isProd = row.line_source === "production"
    if (isProd) {
      agg.production = roundMoney2(agg.production + delivery)
    } else {
      agg.media = roundMoney2(agg.media + mediaFull)
      agg.feeLike = roundMoney2(agg.feeLike + remainder)
    }
    const mt = String(row.media_type || "search")
    agg.costs[mt] = roundMoney2((agg.costs[mt] ?? 0) + mediaFull)

    const lineKey = `${row.line_uid}::${mt}`
    let line = agg.lines.get(lineKey)
    if (!line) {
      line = {
        id: row.line_uid,
        header1: "",
        header2: "",
        monthlyAmounts: {},
        feeMonthlyAmounts: {},
        totalAmount: 0,
        totalFeeAmount: 0,
      }
      agg.lines.set(lineKey, line)
    }
    line.monthlyAmounts![monthYear] = roundMoney2(
      (line.monthlyAmounts![monthYear] ?? 0) + mediaFull
    )
    line.feeMonthlyAmounts![monthYear] = roundMoney2(
      (line.feeMonthlyAmounts![monthYear] ?? 0) + remainder
    )
    line.totalAmount = roundMoney2((line.totalAmount ?? 0) + mediaFull)
    line.totalFeeAmount = roundMoney2((line.totalFeeAmount ?? 0) + remainder)
  }

  return [...byMonth.values()]
    .sort((a, b) => {
      const ai = scheduleMonthYearToIso(a.monthYear) ?? ""
      const bi = scheduleMonthYearToIso(b.monthYear) ?? ""
      return ai.localeCompare(bi)
    })
    .map((agg) => {
      const lineItems: BillingMonth["lineItems"] = {}
      for (const [key, line] of agg.lines) {
        const mt = key.split("::")[1] || "search"
        if (!(lineItems as Record<string, BillingLineItem[]>)[mt]) {
          ;(lineItems as Record<string, BillingLineItem[]>)[mt] = []
        }
        ;(lineItems as Record<string, BillingLineItem[]>)[mt].push(line)
      }
      const costs = emptyCosts()
      for (const [k, v] of Object.entries(agg.costs)) {
        if (k in costs) (costs as Record<string, string>)[k] = moneyStr(v)
      }
      if (agg.production > 0) costs.production = moneyStr(agg.production)
      const total = roundMoney2(agg.media + agg.feeLike + agg.production)
      return {
        monthYear: agg.monthYear,
        mediaTotal: moneyStr(agg.media),
        feeTotal: moneyStr(agg.feeLike),
        adservingTechFees: moneyStr(0),
        production: moneyStr(agg.production),
        totalAmount: moneyStr(total),
        mediaCosts: costs,
        lineItems,
      } satisfies BillingMonth
    })
}

/** Delivery schedule JSON shape pacing parsers accept (month array). */
export function deliveryScheduleJsonFromPlanDeliveryRows(rows: PlanDeliveryRow[]): BillingMonth[] {
  return billingMonthsFromPlanDeliveryRows(rows)
}
