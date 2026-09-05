/**
 * Sum fee / adserving dollars from a persisted `legacy_schedules.billingSchedule`.
 *
 * Historic Xano-era published versions often have no `mba_fee_snapshots` row and
 * no fee component in `schedule_months`. The billing blob still carries the
 * fee and adserving that were frozen into the Xano workbook. Overlay those
 * dollars onto regenerated Excel totals — do not recompute a local media/fee split.
 */

import { parseCurrency } from "@/lib/mediaplan/partialMba"
import { roundMoney2 } from "@/lib/format/money"

export type LegacyBillingTotals = {
  fee: number
  adserving: number
  production: number
}

export function sumLegacyBillingTotals(billingSchedule: unknown): LegacyBillingTotals {
  const months = Array.isArray(billingSchedule) ? billingSchedule : []
  let fee = 0
  let adserving = 0
  let production = 0
  for (const month of months) {
    if (!month || typeof month !== "object") continue
    const row = month as Record<string, unknown>
    fee += parseCurrency(row.feeTotal as string | number | null | undefined)
    adserving += parseCurrency(
      row.adservingTechFees as string | number | null | undefined,
    )
    production += parseCurrency(row.production as string | number | null | undefined)
  }
  return {
    fee: roundMoney2(fee),
    adserving: roundMoney2(adserving),
    production: roundMoney2(production),
  }
}

export function feeSnapshotHasRates(fees: unknown): boolean {
  if (!fees || typeof fees !== "object" || Array.isArray(fees)) return false
  for (const value of Object.values(fees as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
      return true
    }
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value)
      if (Number.isFinite(n) && n !== 0) return true
    }
  }
  return false
}
