/**
 * Campaign dashboard media-mix donut — single authoritative source.
 *
 * Uses the same `monthlySpendArrayFromDeliverySchedule` parser as Expected Spend /
 * total planned (`lib/spend/resolveCampaignExpectedSpend.ts`), so the donut total
 * and Expected Spend live in the same schedule family by construction.
 */

import { monthlySpendArrayFromDeliverySchedule } from "@/lib/spend/monthlyPlanCalendar"

/** AV-4-style basis caption: what the donut represents (not delivered spend). */
export const MEDIA_MIX_DONUT_BASIS_CAPTION = "delivery schedule · planned media"

export type MediaMixChannelRow = {
  channel: string
  spend: number
}

export type MediaMixMonthlyRow = {
  month: string
  [channel: string]: string | number
}

/**
 * Per-channel totals from the delivery schedule (sum across months).
 * Empty when the schedule has no positive media/fee amounts.
 */
export function channelTotalsFromDeliverySchedule(
  deliverySchedule: unknown,
): MediaMixChannelRow[] {
  const rows = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
  const totals: Record<string, number> = {}
  for (const row of rows) {
    for (const { mediaType, amount } of row.data) {
      if (!Number.isFinite(amount) || amount <= 0) continue
      totals[mediaType] = (totals[mediaType] || 0) + amount
    }
  }
  return Object.entries(totals).map(([channel, spend]) => ({ channel, spend }))
}

/** Sum of all channel slices — the donut centre total. */
export function mediaMixTotalFromDeliverySchedule(deliverySchedule: unknown): number {
  return channelTotalsFromDeliverySchedule(deliverySchedule).reduce(
    (sum, row) => sum + row.spend,
    0,
  )
}

/**
 * Month × channel matrix for the stacked "Planned media by month" chart,
 * derived from the same delivery-schedule parse as the donut.
 */
export function monthlyMixFromDeliverySchedule(
  deliverySchedule: unknown,
): MediaMixMonthlyRow[] {
  const rows = monthlySpendArrayFromDeliverySchedule(deliverySchedule)
  return rows
    .map((row) => {
      const out: MediaMixMonthlyRow = { month: row.month }
      for (const { mediaType, amount } of row.data) {
        if (!Number.isFinite(amount) || amount <= 0) continue
        out[mediaType] = amount
      }
      return out
    })
    .filter((row) => Object.keys(row).length > 1)
    .sort((a, b) => {
      const aDate = new Date(String(a.month)).getTime()
      const bDate = new Date(String(b.month)).getTime()
      if (Number.isNaN(aDate) || Number.isNaN(bDate)) {
        return String(a.month).localeCompare(String(b.month))
      }
      return aDate - bDate
    })
}
