/**
 * Version entry-point for {@link computeCampaignFinancials}.
 *
 * Finance hub versions are not channel-hydrated (timeout risk), so this hydrates
 * {@link CampaignFinancials} from the persisted billing/delivery schedules — those
 * JSON payloads are already core schedule outputs from the MBA editor.
 *
 * When channel `*_line_items` + fee loading are present, recomputes via
 * {@link computeCampaignFinancials} instead.
 */

import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { BillingMonth, BillingLineItem as ScheduleBillingLineItem } from "@/lib/billing/types"
import { monthExGstFromScheduleEntry } from "@/lib/finance/computeBillableAlignedMbaTotal"
import {
  computeCampaignFinancials,
  type ComputeCampaignFinancialsOpts,
} from "@/lib/finance/computeCampaignFinancials"
import type {
  CampaignFinancials,
  FeeLoading,
  LineItemInput,
  MbaScopeTotals,
  PerLineResult,
} from "@/lib/finance/campaignFinancials.types"
import { addGst } from "@/lib/finance/gst"
import { getBillingSchedule, getDeliverySchedule } from "@/lib/finance/normalizeFields"
import { MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS } from "@/lib/finance/planLineItemEnrichment"
import { matchMonthYear } from "@/lib/finance/utils"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"

function parseScheduleMoney(value: string | undefined): number {
  return parseMoneyInput(value ?? 0) ?? 0
}

function campaignOptsFromVersion(version: Record<string, unknown>): ComputeCampaignFinancialsOpts {
  const startRaw = version.campaign_start_date ?? version.mp_campaigndates_start
  const endRaw = version.campaign_end_date ?? version.mp_campaigndates_end
  const start = startRaw ? new Date(String(startRaw)) : undefined
  const end = endRaw ? new Date(String(endRaw)) : undefined
  return {
    ...(start && !Number.isNaN(start.getTime()) ? { campaignStart: start } : {}),
    ...(end && !Number.isNaN(end.getTime()) ? { campaignEnd: end } : {}),
  }
}

function tableKeyToCamel(tableKey: string): string {
  return tableKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** True when the version payload includes at least one channel line-item row. */
export function versionHasChannelLineItems(version: Record<string, unknown>): boolean {
  for (const tableKey of MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS) {
    const camel = tableKeyToCamel(tableKey)
    const raw = version[tableKey] ?? version[camel]
    if (Array.isArray(raw) && raw.length > 0) return true
  }
  return false
}

function perLineFromScheduleMonths(months: BillingMonth[]): PerLineResult[] {
  const byId = new Map<string, PerLineResult>()

  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const [mediaKey, items] of Object.entries(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items as ScheduleBillingLineItem[]) {
        const id = String(item.id ?? "").trim()
        if (!id) continue
        const monthAmt = item.monthlyAmounts?.[month.monthYear] ?? 0
        const feeAmt = item.feeMonthlyAmounts?.[month.monthYear] ?? 0
        const existing = byId.get(id)
        if (existing) {
          existing.media = roundMoney2(existing.media + monthAmt)
          existing.fee = roundMoney2(existing.fee + feeAmt)
          existing.nett = roundMoney2(existing.media + existing.fee)
          existing.billingMonths.push({ month: month.monthYear, amount: monthAmt })
          existing.deliveryMonths.push({ month: month.monthYear, amount: monthAmt })
        } else {
          byId.set(id, {
            lineItemId: id,
            mediaType: mediaKey,
            media: roundMoney2(monthAmt),
            fee: roundMoney2(feeAmt),
            nett: roundMoney2(monthAmt + feeAmt),
            deliverables: 0,
            deliveryMonths: [{ month: month.monthYear, amount: monthAmt }],
            billingMonths: [{ month: month.monthYear, amount: monthAmt }],
            flags: {
              clientPaysForMedia: item.clientPaysForMedia === true,
              manualBilling: item.billingMode === "manual",
              manualFee: item.feeBillingMode === "manual",
              excluded: false,
            },
          })
        }
      }
    }
  }

  return [...byId.values()]
}

/**
 * MBA scope from persisted schedules — match {@link computeCampaignFinancials}:
 * grossMedia / nettExGst use the DELIVERY schedule (full booked media, including
 * client-pays). Billing already zeros client-pays media; preferring billing here
 * would understate scope and cause a second subtract in
 * {@link financialsFromPersistedSchedules}.
 */
function mbaScopeFromSchedules(billing: BillingMonth[], delivery: BillingMonth[]): MbaScopeTotals {
  const source = delivery.length > 0 ? delivery : billing
  let grossMedia = 0
  let fee = 0
  let adServing = 0
  let production = 0
  for (const m of source) {
    grossMedia += parseScheduleMoney(m.mediaTotal)
    fee += parseScheduleMoney(m.feeTotal)
    adServing += parseScheduleMoney(m.adservingTechFees)
    production += parseScheduleMoney(m.production)
  }
  const nettExGst = roundMoney2(grossMedia + fee + adServing + production)
  return {
    grossMedia: roundMoney2(grossMedia),
    fee: roundMoney2(fee),
    adServing: roundMoney2(adServing),
    production: roundMoney2(production),
    nettExGst,
    nettIncGst: addGst(nettExGst),
  }
}

function financialsFromPersistedSchedules(
  billingSchedule: BillingMonth[],
  deliverySchedule: BillingMonth[]
): CampaignFinancials {
  const delivery = deliverySchedule.length > 0 ? deliverySchedule : billingSchedule
  const billing = billingSchedule.length > 0 ? billingSchedule : deliverySchedule
  const mbaScopeTotals = mbaScopeFromSchedules(billing, delivery)
  const perLine = perLineFromScheduleMonths(delivery.length ? delivery : billing)

  const billableMbaExGst = roundMoney2(
    mbaScopeTotals.nettExGst -
      perLine.filter((p) => p.flags.clientPaysForMedia).reduce((s, p) => s + p.media, 0)
  )
  // Billing schedule headers are already client-pays = fee only; compare to billable MBA.
  const billingTotal = roundMoney2(
    billing.reduce((s, m) => s + monthExGstFromScheduleEntry(m as unknown as Record<string, unknown>), 0)
  )

  return {
    perLine,
    deliverySchedule: delivery,
    billingSchedule: billing,
    mbaScopeTotals,
    deliveryVsBillingDelta: [],
    validation: {
      billableEqualsMba: Math.abs(billableMbaExGst - billingTotal) < 0.02,
      deltaExGst: roundMoney2(billingTotal - billableMbaExGst),
    },
    mbaFeeAdjusted: false,
    rebill_needed: false,
  }
}

/**
 * `computeCampaignFinancials(version)` — finance / schedule hydrate path.
 * Returns `null` when the version has neither usable billing nor delivery schedules
 * (and cannot recompute from channel lines).
 */
export function computeCampaignFinancialsFromVersion(
  version: Record<string, unknown>,
  client?: { feeLoading?: FeeLoading },
  /** Optional: pre-built line inputs when a caller already mapped channel tables. */
  lineItems?: LineItemInput[]
): CampaignFinancials | null {
  const feeLoading = client?.feeLoading
  if (lineItems && lineItems.length > 0 && feeLoading) {
    return computeCampaignFinancials(lineItems, { feeLoading }, campaignOptsFromVersion(version))
  }

  const billingSchedule =
    parsePersistedBillingScheduleToMonths(getBillingSchedule(version)) ?? []
  const deliverySchedule =
    parsePersistedBillingScheduleToMonths(getDeliverySchedule(version)) ?? []

  if (billingSchedule.length === 0 && deliverySchedule.length === 0) {
    return null
  }

  return financialsFromPersistedSchedules(billingSchedule, deliverySchedule)
}

/** Locate a schedule month for a calendar year/month (`YYYY` / `1–12`). */
export function findScheduleMonthForCalendar(
  schedule: BillingMonth[],
  year: number,
  month: number
): BillingMonth | undefined {
  const monthNames = [
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
  ]
  const target = `${monthNames[month - 1]} ${year}`
  const exact = schedule.find((m) => m.monthYear === target)
  if (exact) return exact
  return schedule.find((m) => matchMonthYear(m.monthYear, year, month))
}
