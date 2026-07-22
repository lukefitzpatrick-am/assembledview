/**
 * Pure campaign financials engine (Phase 2).
 *
 * Uses existing primitives only:
 * - {@link computeBurstAmounts} for media/fee/nett (budgetIncludesFees + clientPays)
 * - {@link computeDeliverableFromMedia} / {@link roundDeliverables} for deliverables
 * - {@link computeBillingAndDeliveryMonths} for month schedules
 * - {@link addGst} for GST
 * - {@link validateBillableEqualsMba} for the billable≠MBA gate
 */

import { computeBillingAndDeliveryMonths } from "@/lib/billing/computeSchedule"
import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import type { BillingBurst, BillingMonth } from "@/lib/billing/types"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import {
  coerceBuyTypeWithDevWarn,
  computeDeliverableFromMedia,
  roundDeliverables,
  type BuyType,
} from "@/lib/mediaplan/deliverableBudget"
import { formatAUD, parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import { addGst } from "@/lib/finance/gst"
import { monthExGstFromScheduleEntry } from "@/lib/finance/computeBillableAlignedMbaTotal"
import { validateBillableEqualsMba } from "@/lib/finance/validateBillableEqualsMba"
import type {
  BillingOverride,
  CampaignFinancials,
  ClientFeeField,
  DeliveryVsBillingDelta,
  FeeLoading,
  FeeOverride,
  LineItemInput,
  MbaScopeTotals,
  MonthAmount,
  PerLineResult,
} from "@/lib/finance/campaignFinancials.types"

const SCHEDULE_MONTH_NAMES = [
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

const ISO_MONTH_RE = /^(\d{4})-(\d{2})$/
const SCHEDULE_MONTH_YEAR_RE = /^([A-Za-z]+)\s+(\d{4})$/

/**
 * Convert billing_overrides ISO month (`2026-06`) to schedule `monthYear` (`June 2026`).
 * Idempotent for values already in schedule form.
 */
export function isoMonthToScheduleMonthYear(month: string): string {
  const raw = String(month ?? "").trim()
  if (!raw) return raw
  const iso = ISO_MONTH_RE.exec(raw)
  if (iso) {
    const year = Number(iso[1])
    const monthNum = Number(iso[2])
    if (!Number.isFinite(year) || monthNum < 1 || monthNum > 12) return raw
    return `${SCHEDULE_MONTH_NAMES[monthNum - 1]} ${year}`
  }
  const schedule = SCHEDULE_MONTH_YEAR_RE.exec(raw)
  if (schedule) {
    const name = schedule[1]!
    const year = schedule[2]!
    const idx = SCHEDULE_MONTH_NAMES.findIndex(
      (n) => n.toLowerCase() === name.toLowerCase()
    )
    if (idx >= 0) return `${SCHEDULE_MONTH_NAMES[idx]} ${year}`
  }
  return raw
}

/**
 * Convert schedule `monthYear` (`June 2026`) to ISO month (`2026-06`).
 * Idempotent for values already in ISO form.
 */
export function scheduleMonthYearToIso(monthYear: string): string {
  const raw = String(monthYear ?? "").trim()
  if (!raw) return raw
  if (ISO_MONTH_RE.test(raw)) return raw
  const schedule = SCHEDULE_MONTH_YEAR_RE.exec(raw)
  if (!schedule) return raw
  const name = schedule[1]!
  const year = schedule[2]!
  const idx = SCHEDULE_MONTH_NAMES.findIndex(
    (n) => n.toLowerCase() === name.toLowerCase()
  )
  if (idx < 0) return raw
  return `${year}-${String(idx + 1).padStart(2, "0")}`
}

/** Schedule media-type keys accepted by {@link computeBillingAndDeliveryMonths}. */
export type ScheduleMediaTypeKey =
  | "search"
  | "socialMedia"
  | "progAudio"
  | "cinema"
  | "digiAudio"
  | "digiDisplay"
  | "digiVideo"
  | "progDisplay"
  | "progVideo"
  | "progBvod"
  | "progOoh"
  | "television"
  | "radio"
  | "newspaper"
  | "magazines"
  | "ooh"
  | "bvod"
  | "integration"
  | "influencers"
  | "production"

export type ComputeCampaignFinancialsOpts = {
  campaignStart?: Date
  campaignEnd?: Date
  adservaudio?: number
  getRateForMediaType?: (mediaType: string) => number
  /** Passed through to schedule compute (parity with editor); unused numerically. */
  isManualBilling?: boolean
}

type ResolvedLine = {
  input: LineItemInput
  feePct: number
  scheduleMediaType: ScheduleMediaTypeKey
  excluded: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  media: number
  /** Effective fee (override sum when feeOverride is manual; else calculated). */
  fee: number
  /** Calculated agency fee before any fee override. */
  calculatedFee: number
  nett: number
  deliverables: number
  deliveryMonths: MonthAmount[]
  billingMonths: MonthAmount[]
  /** Billing fee months after fee override (schedule monthYear keys); empty when auto. */
  feeBillingMonths: MonthAmount[]
  bursts: BillingBurst[]
  billingOverride?: BillingOverride
  feeOverride?: FeeOverride
}

const MEDIA_TYPE_ALIASES: Record<string, ScheduleMediaTypeKey> = {
  television: "television",
  tv: "television",
  radio: "radio",
  newspaper: "newspaper",
  newspapers: "newspaper",
  magazine: "magazines",
  magazines: "magazines",
  ooh: "ooh",
  cinema: "cinema",
  digidisplay: "digiDisplay",
  digitaldisplay: "digiDisplay",
  digiaudio: "digiAudio",
  digitalaudio: "digiAudio",
  digivideo: "digiVideo",
  digitalvideo: "digiVideo",
  bvod: "bvod",
  integration: "integration",
  search: "search",
  social: "socialMedia",
  socialmedia: "socialMedia",
  progdisplay: "progDisplay",
  programmaticdisplay: "progDisplay",
  progvideo: "progVideo",
  programmaticvideo: "progVideo",
  progbvod: "progBvod",
  programmaticbvod: "progBvod",
  progaudio: "progAudio",
  programmaticaudio: "progAudio",
  progooh: "progOoh",
  programmaticooh: "progOoh",
  influencers: "influencers",
  contentcreator: "influencers",
  production: "production",
}

const FEE_FIELD_BY_MEDIA: Record<ScheduleMediaTypeKey, ClientFeeField> = {
  television: "feetelevision",
  radio: "feeradio",
  newspaper: "feenewspapers",
  magazines: "feemagazines",
  ooh: "feeooh",
  cinema: "feecinema",
  digiDisplay: "feedigidisplay",
  digiAudio: "feedigiaudio",
  digiVideo: "feedigivideo",
  bvod: "feebvod",
  integration: "feeintegration",
  search: "feesearch",
  socialMedia: "feesocial",
  progDisplay: "feeprogdisplay",
  progVideo: "feeprogvideo",
  progBvod: "feeprogbvod",
  progAudio: "feeprogaudio",
  progOoh: "feeprogooh",
  influencers: "feeinfluencers",
  production: "feecontentcreator",
}

function normaliseToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "")
}

export function normaliseScheduleMediaType(mediaType: string): ScheduleMediaTypeKey {
  const key = MEDIA_TYPE_ALIASES[normaliseToken(mediaType)]
  return key ?? "search"
}

export function resolveFeePctFromFeeLoading(
  mediaType: string,
  feeLoading: FeeLoading
): number {
  const scheduleKey = normaliseScheduleMediaType(mediaType)
  // REVIEW: ProductionContainer hardcodes feePct={0}. Do not bill production from
  // feecontentcreator (that field is the Influencers content-fee fallback only).
  if (scheduleKey === "production") {
    return 0
  }
  const primary = FEE_FIELD_BY_MEDIA[scheduleKey]
  const primaryVal = feeLoading[primary]
  if (typeof primaryVal === "number" && Number.isFinite(primaryVal)) {
    return primaryVal
  }
  // Integration: absent feeintegration => 0% (same as traditional channels). No
  // feecontentcreator fallback.
  // Influencers: all clients inherit feecontentcreator when feeinfluencers is absent.
  if (scheduleKey === "influencers") {
    const fallback = feeLoading.feecontentcreator
    if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback
  }
  return 0
}

function resolveLineFeePct(line: LineItemInput, feeLoading: FeeLoading): number {
  if (typeof line.feePct === "number" && Number.isFinite(line.feePct)) {
    return line.feePct
  }
  return resolveFeePctFromFeeLoading(line.mediaType, feeLoading)
}

function toDate(value: string | Date | undefined, fallback: Date): Date {
  return coerceBurstDateLocal(value) ?? fallback
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") return parseMoneyInput(value) ?? 0
  return 0
}

function moneyMapToMonthAmounts(shares: Record<string, number>): MonthAmount[] {
  return Object.entries(shares)
    .filter(([, amount]) => Math.abs(amount) > 1e-9)
    .map(([month, amount]) => ({ month, amount: roundMoney2(amount) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function reformatMoney(value: number): string {
  return formatAUD(roundMoney2(value))
}

function parseMonthMoney(value: string | undefined): number {
  return roundMoney2(parseMoneyInput(value ?? 0) ?? 0)
}

function adjustBillingMonthFee(month: BillingMonth, delta: number): BillingMonth {
  if (Math.abs(delta) < 1e-9) return month
  const mediaTotal = parseMonthMoney(month.mediaTotal)
  const feeTotal = parseMonthMoney(month.feeTotal) + delta
  const adServing = parseMonthMoney(month.adservingTechFees)
  const production = parseMonthMoney(month.production)
  return {
    ...month,
    feeTotal: reformatMoney(feeTotal),
    totalAmount: reformatMoney(mediaTotal + feeTotal + adServing + production),
  }
}

function emptyBillingMonth(monthYear: string): BillingMonth {
  return {
    monthYear,
    mediaTotal: reformatMoney(0),
    feeTotal: reformatMoney(0),
    totalAmount: reformatMoney(0),
    adservingTechFees: reformatMoney(0),
    production: reformatMoney(0),
    mediaCosts: {
      search: reformatMoney(0),
      socialMedia: reformatMoney(0),
      television: reformatMoney(0),
      radio: reformatMoney(0),
      newspaper: reformatMoney(0),
      magazines: reformatMoney(0),
      ooh: reformatMoney(0),
      cinema: reformatMoney(0),
      digiDisplay: reformatMoney(0),
      digiAudio: reformatMoney(0),
      digiVideo: reformatMoney(0),
      bvod: reformatMoney(0),
      integration: reformatMoney(0),
      progDisplay: reformatMoney(0),
      progVideo: reformatMoney(0),
      progBvod: reformatMoney(0),
      progAudio: reformatMoney(0),
      progOoh: reformatMoney(0),
      influencers: reformatMoney(0),
      production: reformatMoney(0),
    },
  }
}

function adjustBillingMonthMedia(
  month: BillingMonth,
  mediaType: ScheduleMediaTypeKey,
  delta: number
): BillingMonth {
  if (Math.abs(delta) < 1e-9) return month
  const mediaTotal = parseMonthMoney(month.mediaTotal) + delta
  const feeTotal = parseMonthMoney(month.feeTotal)
  const adServing = parseMonthMoney(month.adservingTechFees)
  const production = parseMonthMoney(month.production)
  const mediaCosts = { ...month.mediaCosts }
  const prev = parseMonthMoney(mediaCosts[mediaType as keyof typeof mediaCosts])
  ;(mediaCosts as Record<string, string>)[mediaType] = reformatMoney(prev + delta)
  return {
    ...month,
    mediaTotal: reformatMoney(mediaTotal),
    mediaCosts,
    totalAmount: reformatMoney(mediaTotal + feeTotal + adServing + production),
  }
}

function campaignDateBounds(
  lineItems: LineItemInput[],
  opts?: ComputeCampaignFinancialsOpts
): { start: Date; end: Date } {
  if (opts?.campaignStart && opts?.campaignEnd) {
    return { start: opts.campaignStart, end: opts.campaignEnd }
  }
  let minMs = Number.POSITIVE_INFINITY
  let maxMs = Number.NEGATIVE_INFINITY
  for (const line of lineItems) {
    for (const burst of line.bursts ?? []) {
      const s = toDate(burst.startDate, new Date(NaN)).getTime()
      const e = toDate(burst.endDate, new Date(NaN)).getTime()
      if (Number.isFinite(s)) minMs = Math.min(minMs, s)
      if (Number.isFinite(e)) maxMs = Math.max(maxMs, e)
    }
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    const now = new Date()
    const start = opts?.campaignStart ?? new Date(now.getFullYear(), now.getMonth(), 1)
    const end = opts?.campaignEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start, end }
  }
  return {
    start: opts?.campaignStart ?? new Date(minMs),
    end: opts?.campaignEnd ?? new Date(maxMs),
  }
}

function resolveBurstBudgets(line: LineItemInput): number[] {
  const bursts = line.bursts ?? []
  if (bursts.length === 0) {
    return [Number.isFinite(line.enteredAmount) ? line.enteredAmount : 0]
  }
  const budgets = bursts.map((b) => parseAmount(b.budget))
  const sum = budgets.reduce((a, b) => a + b, 0)
  if (sum > 0) return budgets
  // No burst budgets — allocate line enteredAmount evenly across bursts.
  const n = bursts.length
  const each = n > 0 ? (Number.isFinite(line.enteredAmount) ? line.enteredAmount : 0) / n : 0
  return bursts.map(() => each)
}

function computeLineDeliverables(
  line: LineItemInput,
  feePct: number,
  burstBudgets: number[]
): number {
  const buyType = coerceBuyTypeWithDevWarn(line.buyType, "computeCampaignFinancials")
  const buyTypeLower = String(line.buyType || "").toLowerCase()

  if (buyTypeLower === "bonus" || buyTypeLower === "package_inclusions") {
    if (typeof line.deliverablesManual === "number" && Number.isFinite(line.deliverablesManual)) {
      return roundDeliverables(buyType, line.deliverablesManual)
    }
    let manual = 0
    for (const burst of line.bursts ?? []) {
      const fromBurst =
        typeof burst.deliverables === "number" && Number.isFinite(burst.deliverables)
          ? burst.deliverables
          : typeof burst.calculatedValue === "number" && Number.isFinite(burst.calculatedValue)
            ? burst.calculatedValue
            : 0
      manual += fromBurst
    }
    return roundDeliverables(buyType, manual)
  }

  const bursts = line.bursts ?? []
  if (bursts.length === 0) {
    const unitRate = Number.isFinite(line.rate) && line.rate !== 0 ? line.rate : 0
    const raw = computeDeliverableFromMedia({
      buyType,
      rawBudget: Number.isFinite(line.enteredAmount) ? line.enteredAmount : 0,
      buyAmount: unitRate,
      budgetIncludesFees: line.budgetIncludesFees,
      feePct,
    })
    return Number.isNaN(raw) ? 0 : roundDeliverables(buyType, raw)
  }

  let total = 0
  for (let i = 0; i < bursts.length; i++) {
    const burst = bursts[i]!
    const unitRate =
      parseAmount(burst.buyAmount) ||
      (Number.isFinite(line.rate) ? line.rate : 0) ||
      0
    const raw = computeDeliverableFromMedia({
      buyType,
      rawBudget: burstBudgets[i] ?? 0,
      buyAmount: unitRate,
      budgetIncludesFees: line.budgetIncludesFees,
      feePct,
    })
    if (!Number.isNaN(raw)) {
      total += roundDeliverables(buyType, raw)
    }
  }
  return total
}

function buildResolvedLine(
  line: LineItemInput,
  feeLoading: FeeLoading,
  campaignStart: Date,
  campaignEnd: Date,
  monthKeys: string[]
): ResolvedLine {
  const feePct = resolveLineFeePct(line, feeLoading)
  const scheduleMediaType = normaliseScheduleMediaType(line.mediaType)
  const excluded = line.approval === "excluded"
  const clientPaysForMedia = Boolean(line.clientPaysForMedia)
  const budgetIncludesFees = Boolean(line.budgetIncludesFees)
  const buyType = String(line.buyType || "")
  const burstBudgets = resolveBurstBudgets(line)
  const sourceBursts =
    line.bursts && line.bursts.length > 0
      ? line.bursts
      : [
          {
            startDate: campaignStart,
            endDate: campaignEnd,
            budget: line.enteredAmount,
            buyAmount: line.rate,
          },
        ]

  let media = 0
  let fee = 0
  let nett = 0
  const billingBursts: BillingBurst[] = []
  const deliveryShares: Record<string, number> = {}
  const billingShares: Record<string, number> = {}

  for (let i = 0; i < sourceBursts.length; i++) {
    const burst = sourceBursts[i]!
    const rawBudget = burstBudgets[i] ?? parseAmount(burst.budget)
    const amounts = computeBurstAmounts({
      rawBudget,
      budgetIncludesFees,
      clientPaysForMedia,
      feePct,
      buyType: line.buyType,
    })
    media += amounts.deliveryMediaAmount
    fee += amounts.feeAmount
    nett += amounts.totalAmount

    const startDate = toDate(burst.startDate, campaignStart)
    const endDate = toDate(burst.endDate, campaignEnd)
    const deliverablesForBurst =
      sourceBursts.length === 1
        ? computeLineDeliverables(line, feePct, burstBudgets)
        : (() => {
            const bt = coerceBuyTypeWithDevWarn(buyType, "computeCampaignFinancials.burst")
            const unitRate =
              parseAmount(burst.buyAmount) ||
              (Number.isFinite(line.rate) ? line.rate : 0) ||
              0
            if (
              String(buyType).toLowerCase() === "bonus" ||
              String(buyType).toLowerCase() === "package_inclusions"
            ) {
              const manual =
                typeof burst.deliverables === "number"
                  ? burst.deliverables
                  : typeof burst.calculatedValue === "number"
                    ? burst.calculatedValue
                    : (line.deliverablesManual ?? 0)
              return roundDeliverables(bt as BuyType, manual)
            }
            const raw = computeDeliverableFromMedia({
              buyType: bt,
              rawBudget,
              buyAmount: unitRate,
              budgetIncludesFees,
              feePct,
            })
            return Number.isNaN(raw) ? 0 : roundDeliverables(bt, raw)
          })()

    billingBursts.push({
      startDate,
      endDate,
      mediaAmount: amounts.mediaAmount,
      deliveryMediaAmount: amounts.deliveryMediaAmount,
      feeAmount: amounts.feeAmount,
      totalAmount: amounts.totalAmount,
      mediaType: scheduleMediaType,
      noAdserving: line.noAdserving ?? false,
      feePercentage: feePct,
      clientPaysForMedia,
      budgetIncludesFees,
      deliverables: deliverablesForBurst,
      buyType,
      lineItemId: line.lineItemId,
      adServingRatePct: burst.adServingRatePct,
      adServingImpressions: burst.adServingImpressions,
    })

    const dShares = prorateAcrossMonths({
      amount: amounts.deliveryMediaAmount,
      burstStart: startDate,
      burstEnd: endDate,
      monthKeys,
    })
    const bShares = prorateAcrossMonths({
      amount: amounts.mediaAmount,
      burstStart: startDate,
      burstEnd: endDate,
      monthKeys,
    })
    for (const [m, v] of Object.entries(dShares)) {
      deliveryShares[m] = (deliveryShares[m] ?? 0) + v
    }
    for (const [m, v] of Object.entries(bShares)) {
      billingShares[m] = (billingShares[m] ?? 0) + v
    }
  }

  media = roundMoney2(media)
  fee = roundMoney2(fee)
  nett = roundMoney2(nett)
  const calculatedFee = fee

  const deliverables = computeLineDeliverables(line, feePct, burstBudgets)

  let billingMonths = moneyMapToMonthAmounts(billingShares)
  if (line.billingOverride?.mode === "manual" && line.billingOverride.months?.length) {
    billingMonths = line.billingOverride.months.map((m) => ({
      month: isoMonthToScheduleMonthYear(m.month),
      amount: roundMoney2(m.amount),
    }))
  }

  let feeBillingMonths: MonthAmount[] = []
  if (line.feeOverride?.mode === "manual" && line.feeOverride.months?.length) {
    feeBillingMonths = line.feeOverride.months.map((m) => ({
      month: isoMonthToScheduleMonthYear(m.month),
      amount: roundMoney2(m.amount),
    }))
    const overrideFeeSum = roundMoney2(
      feeBillingMonths.reduce((s, m) => s + m.amount, 0)
    )
    // Effective fee = override sum; media timing untouched. Shift nett by fee delta.
    fee = overrideFeeSum
    nett = roundMoney2(nett + (overrideFeeSum - calculatedFee))
  }

  return {
    input: line,
    feePct,
    scheduleMediaType,
    excluded,
    clientPaysForMedia,
    budgetIncludesFees,
    media,
    fee,
    calculatedFee,
    nett,
    deliverables,
    deliveryMonths: moneyMapToMonthAmounts(deliveryShares),
    billingMonths,
    feeBillingMonths,
    bursts: billingBursts,
    billingOverride: line.billingOverride,
    feeOverride: line.feeOverride,
  }
}

function groupBurstsByMediaType(lines: ResolvedLine[]): Record<string, BillingBurst[]> {
  const out: Record<string, BillingBurst[]> = {}
  for (const line of lines) {
    const key = line.scheduleMediaType
    if (!out[key]) out[key] = []
    out[key]!.push(...line.bursts)
  }
  return out
}

function applyManualBillingOverrides(
  billingSchedule: BillingMonth[],
  lines: ResolvedLine[]
): BillingMonth[] {
  let next = billingSchedule.map((m) => ({
    ...m,
    mediaCosts: { ...m.mediaCosts },
  }))

  for (const line of lines) {
    if (line.excluded) continue
    if (line.billingOverride?.mode !== "manual") continue
    if (!line.billingOverride.months?.length) continue

    const autoShares: Record<string, number> = {}
    for (const burst of line.bursts) {
      const shares = prorateAcrossMonths({
        amount: burst.mediaAmount,
        burstStart: burst.startDate,
        burstEnd: burst.endDate,
        monthKeys: next.map((m) => m.monthYear),
      })
      for (const [m, v] of Object.entries(shares)) {
        autoShares[m] = (autoShares[m] ?? 0) + v
      }
    }

    for (const [month, amount] of Object.entries(autoShares)) {
      const idx = next.findIndex((m) => m.monthYear === month)
      if (idx < 0) continue
      next[idx] = adjustBillingMonthMedia(next[idx]!, line.scheduleMediaType, -amount)
    }

    for (const { month, amount } of line.billingOverride.months) {
      const monthYear = isoMonthToScheduleMonthYear(month)
      let idx = next.findIndex((m) => m.monthYear === monthYear)
      if (idx < 0) {
        // Month outside campaign span — append a sparse row.
        next = [...next, emptyBillingMonth(monthYear)]
        idx = next.length - 1
      }
      next[idx] = adjustBillingMonthMedia(
        next[idx]!,
        line.scheduleMediaType,
        roundMoney2(amount)
      )
    }
  }

  return next
}

/**
 * Replace auto-prorated billing fee with per-line feeOverride months.
 * Delivery schedule / media timing are not touched.
 */
function applyManualFeeOverrides(
  billingSchedule: BillingMonth[],
  lines: ResolvedLine[]
): BillingMonth[] {
  let next = billingSchedule.map((m) => ({
    ...m,
    mediaCosts: { ...m.mediaCosts },
  }))

  for (const line of lines) {
    if (line.excluded) continue
    if (line.feeOverride?.mode !== "manual") continue
    if (!line.feeOverride.months?.length) continue

    const autoShares: Record<string, number> = {}
    for (const burst of line.bursts) {
      const shares = prorateAcrossMonths({
        amount: burst.feeAmount,
        burstStart: burst.startDate,
        burstEnd: burst.endDate,
        monthKeys: next.map((m) => m.monthYear),
      })
      for (const [m, v] of Object.entries(shares)) {
        autoShares[m] = (autoShares[m] ?? 0) + v
      }
    }

    for (const [month, amount] of Object.entries(autoShares)) {
      const idx = next.findIndex((m) => m.monthYear === month)
      if (idx < 0) continue
      next[idx] = adjustBillingMonthFee(next[idx]!, -amount)
    }

    for (const { month, amount } of line.feeOverride.months) {
      const monthYear = isoMonthToScheduleMonthYear(month)
      let idx = next.findIndex((m) => m.monthYear === monthYear)
      if (idx < 0) {
        next = [...next, emptyBillingMonth(monthYear)]
        idx = next.length - 1
      }
      next[idx] = adjustBillingMonthFee(next[idx]!, roundMoney2(amount))
    }
  }

  return next
}

function sumScheduleField(
  months: BillingMonth[],
  field: "adservingTechFees" | "production" | "feeTotal" | "mediaTotal"
): number {
  return roundMoney2(
    months.reduce((sum, m) => sum + parseMonthMoney(m[field]), 0)
  )
}

function buildDeliveryVsBillingDelta(
  deliverySchedule: BillingMonth[],
  billingSchedule: BillingMonth[],
  lines: ResolvedLine[]
): DeliveryVsBillingDelta[] {
  const months = new Set<string>()
  for (const m of deliverySchedule) months.add(m.monthYear)
  for (const m of billingSchedule) months.add(m.monthYear)

  const deliveryByMonth = new Map(
    deliverySchedule.map((m) => [m.monthYear, parseMonthMoney(m.mediaTotal)] as const)
  )
  const billingByMonth = new Map(
    billingSchedule.map((m) => [m.monthYear, parseMonthMoney(m.mediaTotal)] as const)
  )

  const result: DeliveryVsBillingDelta[] = []

  for (const month of [...months].sort((a, b) => a.localeCompare(b))) {
    const deliveryMedia = deliveryByMonth.get(month) ?? 0
    const billingMedia = billingByMonth.get(month) ?? 0
    const media = roundMoney2(deliveryMedia - billingMedia)
    if (Math.abs(media) < 0.005) continue

    const reasons: string[] = []
    let explained = 0

    let excludedMedia = 0
    let clientPaysMedia = 0
    let prepaymentShift = 0

    for (const line of lines) {
      const deliveryAmt =
        line.deliveryMonths.find((m) => m.month === month)?.amount ?? 0
      const billingAmt =
        line.billingMonths.find((m) => m.month === month)?.amount ?? 0

      if (line.excluded && Math.abs(deliveryAmt) > 1e-9) {
        excludedMedia += deliveryAmt
      }
      if (!line.excluded && line.clientPaysForMedia && Math.abs(deliveryAmt) > 1e-9) {
        // Billing media is 0 for client-pays; delivery retains full media.
        clientPaysMedia += deliveryAmt
      }
      if (
        !line.excluded &&
        line.billingOverride?.mode === "manual" &&
        line.billingOverride.reason === "prepayment"
      ) {
        prepaymentShift += roundMoney2(deliveryAmt - billingAmt)
      }
    }

    if (Math.abs(excludedMedia) > 0.005) {
      reasons.push("excluded")
      explained += excludedMedia
    }
    if (Math.abs(clientPaysMedia) > 0.005) {
      reasons.push("client_pays_media")
      explained += clientPaysMedia
    }
    if (Math.abs(prepaymentShift) > 0.005) {
      reasons.push("prepayment")
      explained += prepaymentShift
    }

    const residual = roundMoney2(media - explained)
    if (Math.abs(residual) > 0.02 || reasons.length === 0) {
      reasons.push("rounding")
    }

    result.push({ month, media, reasons })
  }

  return result
}

function toPerLineResult(line: ResolvedLine): PerLineResult {
  return {
    lineItemId: line.input.lineItemId,
    mediaType: line.scheduleMediaType,
    media: line.media,
    fee: line.fee,
    nett: line.nett,
    deliverables: line.deliverables,
    deliveryMonths: line.deliveryMonths,
    billingMonths: line.billingMonths,
    flags: {
      clientPaysForMedia: line.clientPaysForMedia,
      manualBilling: line.billingOverride?.mode === "manual",
      manualFee: line.feeOverride?.mode === "manual",
      prepaid: line.billingOverride?.reason === "prepayment",
      excluded: line.excluded,
    },
  }
}

/**
 * Compute campaign financials from line inputs + client fee loading.
 *
 * `computeBurstAmounts` already expresses both `budgetIncludesFees`
 * interpretations (gross split vs net + gross-up) — no fork/extension needed.
 */
export function computeCampaignFinancials(
  lineItems: LineItemInput[],
  client: { feeLoading: FeeLoading },
  opts?: ComputeCampaignFinancialsOpts
): CampaignFinancials {
  const { start: campaignStart, end: campaignEnd } = campaignDateBounds(lineItems, opts)

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
  const monthKeys: string[] = []
  {
    let cur = new Date(campaignStart.getFullYear(), campaignStart.getMonth(), 1)
    const endMonth = new Date(campaignEnd.getFullYear(), campaignEnd.getMonth(), 1)
    while (cur <= endMonth) {
      const y = cur.getFullYear()
      const mi = cur.getMonth()
      monthKeys.push(`${MONTH_NAMES[mi]} ${y}`)
      cur = new Date(y, mi + 1, 1)
    }
  }

  const resolved = lineItems.map((line) =>
    buildResolvedLine(line, client.feeLoading, campaignStart, campaignEnd, monthKeys)
  )

  const allLinesForDelivery = resolved
  const approvedForBilling = resolved.filter((l) => !l.excluded)

  const getRateForMediaType = opts?.getRateForMediaType ?? (() => 0)
  const adservaudio = opts?.adservaudio ?? 0
  const isManualBilling = opts?.isManualBilling ?? false

  const { deliveryMonths: deliverySchedule } = computeBillingAndDeliveryMonths({
    campaignStart,
    campaignEnd,
    burstsByMediaType: groupBurstsByMediaType(allLinesForDelivery),
    getRateForMediaType,
    adservaudio,
    isManualBilling,
  })

  const { billingMonths: autoBillingSchedule, deliveryMonths: approvedDelivery } =
    computeBillingAndDeliveryMonths({
      campaignStart,
      campaignEnd,
      burstsByMediaType: groupBurstsByMediaType(approvedForBilling),
      getRateForMediaType,
      adservaudio,
      isManualBilling,
    })

  const billingSchedule = applyManualFeeOverrides(
    applyManualBillingOverrides(autoBillingSchedule, approvedForBilling),
    approvedForBilling
  )

  const approved = resolved.filter((l) => !l.excluded)
  const grossMedia = roundMoney2(approved.reduce((s, l) => s + l.media, 0))
  // MBA fee follows effective per-line fees (override sum where present).
  const calculatedFeeTotal = roundMoney2(approved.reduce((s, l) => s + l.calculatedFee, 0))
  const fee = roundMoney2(approved.reduce((s, l) => s + l.fee, 0))
  const adServing = sumScheduleField(approvedDelivery, "adservingTechFees")
  const production = sumScheduleField(approvedDelivery, "production")
  const nettExGst = roundMoney2(grossMedia + fee + adServing + production)
  const nettIncGst = addGst(nettExGst)

  const mbaScopeTotals: MbaScopeTotals = {
    grossMedia,
    fee,
    adServing,
    production,
    nettExGst,
    nettIncGst,
  }

  const mbaFeeAdjusted = Math.abs(fee - calculatedFeeTotal) > 0.005
  const rebill_needed = mbaFeeAdjusted

  const clientPaysMedia = roundMoney2(
    approved.filter((l) => l.clientPaysForMedia).reduce((s, l) => s + l.media, 0)
  )
  const billableMbaExGst = roundMoney2(nettExGst - clientPaysMedia)
  const billingScheduleTotalExGst = roundMoney2(
    billingSchedule.reduce((s, m) => s + monthExGstFromScheduleEntry(m as unknown as Record<string, unknown>), 0)
  )

  const validationResult = validateBillableEqualsMba({
    mbaTotalExGst: billableMbaExGst,
    billingScheduleTotalExGst,
  })

  return {
    perLine: resolved.map(toPerLineResult),
    deliverySchedule,
    billingSchedule,
    mbaScopeTotals,
    deliveryVsBillingDelta: buildDeliveryVsBillingDelta(
      deliverySchedule,
      billingSchedule,
      resolved
    ),
    validation: {
      billableEqualsMba: validationResult.ok,
      deltaExGst: validationResult.deltaExGst,
    },
    mbaFeeAdjusted,
    rebill_needed,
  }
}
