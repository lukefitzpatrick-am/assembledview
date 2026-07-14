/**
 * Cent-level parity check: persisted billing schedule vs core campaignFinancials.billingSchedule.
 */

import type { BillingMonth } from "@/lib/billing/types"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import {
  billingOverrideLineIdsMatch,
  toBillingOverrideLineItemId,
} from "@/lib/finance/manualBillingOverridesUi"

const TOLERANCE = 0.01

/** True when |a−b| exceeds $0.01 (with float slack so exact 0.01 still passes). */
function exceedsCentTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) > TOLERANCE + 1e-9
}

function monthMoney(value: unknown): number {
  return roundMoney2(parseMoneyInput(value as string | number | null | undefined) ?? 0)
}

function collectLineTotals(
  months: BillingMonth[],
  kind: "media" | "fee"
): Map<string, number> {
  const map = new Map<string, number>()
  for (const month of months) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        const id = toBillingOverrideLineItemId(String(line.id ?? "").trim())
        if (!id) continue
        const amt =
          kind === "fee"
            ? Number(line.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
            : Number(line.monthlyAmounts?.[month.monthYear] ?? 0) || 0
        map.set(id, roundMoney2((map.get(id) ?? 0) + amt))
      }
    }
  }
  return map
}

export type CoreScheduleParityResult =
  | { ok: true }
  | { ok: false; message: string; deltas: string[] }

/**
 * Assert persisted schedule matches expected core schedule month-by-month and line-by-line
 * (media + fee) within $0.01; campaign media/fee totals must equal (roundMoney2).
 */
export function assertCoreScheduleParity(
  expected: BillingMonth[],
  persisted: BillingMonth[]
): CoreScheduleParityResult {
  const deltas: string[] = []

  const expectedMonths = new Map(expected.map((m) => [m.monthYear, m]))
  const persistedMonths = new Map(persisted.map((m) => [m.monthYear, m]))
  const allMonthYears = new Set([...expectedMonths.keys(), ...persistedMonths.keys()])

  let expectedMediaTotal = 0
  let expectedFeeTotal = 0
  let persistedMediaTotal = 0
  let persistedFeeTotal = 0

  for (const monthYear of [...allMonthYears].sort()) {
    const exp = expectedMonths.get(monthYear)
    const got = persistedMonths.get(monthYear)
    if (!exp) {
      deltas.push(`unexpected month ${monthYear} in persisted schedule`)
      continue
    }
    if (!got) {
      deltas.push(`missing month ${monthYear} in persisted schedule`)
      continue
    }

    const expMedia = monthMoney(exp.mediaTotal)
    const expFee = monthMoney(exp.feeTotal)
    const gotMedia = monthMoney(got.mediaTotal)
    const gotFee = monthMoney(got.feeTotal)
    expectedMediaTotal = roundMoney2(expectedMediaTotal + expMedia)
    expectedFeeTotal = roundMoney2(expectedFeeTotal + expFee)
    persistedMediaTotal = roundMoney2(persistedMediaTotal + gotMedia)
    persistedFeeTotal = roundMoney2(persistedFeeTotal + gotFee)

    if (exceedsCentTolerance(gotMedia, expMedia)) {
      deltas.push(
        `${monthYear} media: got ${gotMedia.toFixed(2)}, expected ${expMedia.toFixed(2)}`
      )
    }
    if (exceedsCentTolerance(gotFee, expFee)) {
      deltas.push(
        `${monthYear} fee: got ${gotFee.toFixed(2)}, expected ${expFee.toFixed(2)}`
      )
    }
  }

  if (exceedsCentTolerance(persistedMediaTotal, expectedMediaTotal)) {
    deltas.push(
      `campaign media total: got ${persistedMediaTotal.toFixed(2)}, expected ${expectedMediaTotal.toFixed(2)}`
    )
  }
  if (exceedsCentTolerance(persistedFeeTotal, expectedFeeTotal)) {
    deltas.push(
      `campaign fee total: got ${persistedFeeTotal.toFixed(2)}, expected ${expectedFeeTotal.toFixed(2)}`
    )
  }

  const expLineMedia = collectLineTotals(expected, "media")
  const gotLineMedia = collectLineTotals(persisted, "media")
  const expLineFee = collectLineTotals(expected, "fee")
  const gotLineFee = collectLineTotals(persisted, "fee")

  const lineIds = new Set([...expLineMedia.keys(), ...gotLineMedia.keys(), ...expLineFee.keys(), ...gotLineFee.keys()])
  for (const id of [...lineIds].sort()) {
    const findGot = (map: Map<string, number>) => {
      if (map.has(id)) return map.get(id)!
      for (const [k, v] of map) {
        if (billingOverrideLineIdsMatch(k, id)) return v
      }
      return 0
    }
    const eMedia = expLineMedia.get(id) ?? 0
    const gMedia = findGot(gotLineMedia)
    const eFee = expLineFee.get(id) ?? 0
    const gFee = findGot(gotLineFee)
    if (exceedsCentTolerance(gMedia, eMedia)) {
      deltas.push(`line ${id} media: got ${gMedia.toFixed(2)}, expected ${eMedia.toFixed(2)}`)
    }
    if (exceedsCentTolerance(gFee, eFee)) {
      deltas.push(`line ${id} fee: got ${gFee.toFixed(2)}, expected ${eFee.toFixed(2)}`)
    }
  }

  if (deltas.length > 0) {
    return {
      ok: false,
      message: `Persisted billing schedule differs from core campaignFinancials (Δ > $${TOLERANCE.toFixed(2)})`,
      deltas,
    }
  }
  return { ok: true }
}
