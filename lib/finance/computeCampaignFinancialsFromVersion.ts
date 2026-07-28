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
import {
  getAttachedBillingMonths,
  getAttachedDeliveryMonths,
} from "@/lib/finance/rows/attachPlanRowSchedules"
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

type PerLineScratch = {
  lineItemId: string
  mediaType: string
  media: number
  feeBilling: number
  feeDelivery: number
  deliverables: number
  deliveryMonths: { month: string; amount: number }[]
  billingMonths: { month: string; amount: number }[]
  flags: PerLineResult["flags"]
  seenBilling: boolean
  seenDelivery: boolean
}

function flagsFromItem(item: ScheduleBillingLineItem): PerLineResult["flags"] {
  return {
    clientPaysForMedia: item.clientPaysForMedia === true,
    manualBilling: item.billingMode === "manual",
    manualFee: item.feeBillingMode === "manual",
    prepaid: item.preBill === true,
    excluded: false,
  }
}

/**
 * Hydrate per-line media timing from BOTH schedules.
 *
 * - `billingMonths` ← BILLING walk (pass stored monthlyAmounts through; client-pays
 *   media is already 0 on the persisted billing blob, matching
 *   {@link collectBlobLineMonthTotals} semantics without a second zero).
 * - `deliveryMonths` / `media` / `deliverables` ← DELIVERY walk.
 * - `fee`: delivery when the line appears in delivery; else billing (billing-only lines).
 * - Union of line ids: a line in only one schedule gets an empty months array on the
 *   other side (not a missing perLine entry).
 * - Flags: first billing sighting wins; else first delivery sighting.
 */
function perLineFromSchedules(
  billing: BillingMonth[],
  delivery: BillingMonth[]
): PerLineResult[] {
  const byId = new Map<string, PerLineScratch>()

  const touch = (
    id: string,
    mediaKey: string,
    item: ScheduleBillingLineItem,
    side: "billing" | "delivery"
  ): PerLineScratch => {
    let row = byId.get(id)
    if (!row) {
      row = {
        lineItemId: id,
        mediaType: mediaKey,
        media: 0,
        feeBilling: 0,
        feeDelivery: 0,
        deliverables: 0,
        deliveryMonths: [],
        billingMonths: [],
        flags: flagsFromItem(item),
        seenBilling: false,
        seenDelivery: false,
      }
      byId.set(id, row)
    }
    // Flags: prefer billing schedule when present; otherwise first delivery sighting.
    if (side === "billing" && !row.seenBilling) {
      row.flags = flagsFromItem(item)
    } else if (side === "delivery" && !row.seenBilling && !row.seenDelivery) {
      row.flags = flagsFromItem(item)
    }
    if (side === "billing") row.seenBilling = true
    if (side === "delivery") row.seenDelivery = true
    if (!row.mediaType) row.mediaType = mediaKey
    return row
  }

  const walk = (months: BillingMonth[], side: "billing" | "delivery"): void => {
    for (const month of months) {
      const lineItems = month.lineItems
      if (!lineItems) continue
      for (const [mediaKey, items] of Object.entries(lineItems)) {
        if (!Array.isArray(items)) continue
        for (const item of items as ScheduleBillingLineItem[]) {
          const id = String(item.id ?? "").trim()
          if (!id) continue
          const monthAmt = Number(item.monthlyAmounts?.[month.monthYear] ?? 0) || 0
          const feeAmt = Number(item.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
          const row = touch(id, mediaKey, item, side)

          if (side === "billing") {
            // Pass stored amount through (already 0 for client-pays on billing blob).
            row.billingMonths.push({ month: month.monthYear, amount: monthAmt })
            row.feeBilling = roundMoney2(row.feeBilling + feeAmt)
          } else {
            row.deliveryMonths.push({ month: month.monthYear, amount: monthAmt })
            row.media = roundMoney2(row.media + monthAmt)
            row.feeDelivery = roundMoney2(row.feeDelivery + feeAmt)
          }
        }
      }
    }
  }

  walk(billing, "billing")
  walk(delivery, "delivery")

  return [...byId.values()].map((row) => {
    const fee = row.seenDelivery ? row.feeDelivery : row.feeBilling
    return {
      lineItemId: row.lineItemId,
      mediaType: row.mediaType,
      media: row.media,
      fee,
      nett: roundMoney2(row.media + fee),
      deliverables: row.deliverables,
      deliveryMonths: row.deliveryMonths,
      billingMonths: row.billingMonths,
      flags: row.flags,
    }
  })
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
  const perLine = perLineFromSchedules(billing, delivery)

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

  // Plan C S2-P5 — prefer schedules attached from plan_*_rows (per-surface hydrate).
  // Absent attach → instant blob fallback.
  const attachedBilling = getAttachedBillingMonths(version)
  const attachedDelivery = getAttachedDeliveryMonths(version)

  const billingSchedule =
    attachedBilling && attachedBilling.length > 0
      ? attachedBilling
      : parsePersistedBillingScheduleToMonths(getBillingSchedule(version)) ?? []
  const deliverySchedule =
    attachedDelivery && attachedDelivery.length > 0
      ? attachedDelivery
      : parsePersistedBillingScheduleToMonths(getDeliverySchedule(version)) ?? []

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
