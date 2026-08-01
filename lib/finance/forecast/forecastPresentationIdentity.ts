/**
 * FIN-5 presentation identity gates — pure sums over a client block / dataset.
 * Media breakouts must match AA+AM; Fees + Commissions must match revenue body
 * excluding total_revenue (and excluding other-revenue lines that sit outside those rollups
 * when comparing rollups alone — see `assertFeesCommissionsCoverRevenueBody`).
 */

import {
  FINANCE_FORECAST_COMMISSION_LINE_KEYS,
  FINANCE_FORECAST_FEE_LINE_KEYS,
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_GROUP_KEYS,
  FINANCE_FORECAST_LINE_KEYS,
  FINANCE_FORECAST_OTHER_REVENUE_LINE_KEYS,
  isFinanceForecastEntityBillingLine,
  isFinanceForecastMediaBreakoutLine,
  type FinanceForecastClientBlock,
  type FinanceForecastDataset,
  type FinanceForecastLine,
  type FinanceForecastLineKey,
} from "@/lib/types/financeForecast"

const CENT = 0.01

export function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function sumLineFy(lines: readonly FinanceForecastLine[]): number {
  let t = 0
  for (const line of lines) t += line.fy_total ?? 0
  return roundMoney2(t)
}

export function sumLineMonthlyEqual(
  a: readonly FinanceForecastLine[],
  b: readonly FinanceForecastLine[]
): boolean {
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
    let sa = 0
    let sb = 0
    for (const line of a) sa += line.monthly[k] ?? 0
    for (const line of b) sb += line.monthly[k] ?? 0
    if (Math.abs(roundMoney2(sa) - roundMoney2(sb)) > CENT - 1e-9) return false
  }
  return true
}

function billingGroupLines(block: FinanceForecastClientBlock): FinanceForecastLine[] {
  const g = block.groups.find((x) => x.group_key === FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation)
  return g?.lines ?? []
}

function revenueGroupLines(block: FinanceForecastClientBlock): FinanceForecastLine[] {
  const g = block.groups.find((x) => x.group_key === FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission)
  return g?.lines ?? []
}

function linesWithKeys(
  lines: readonly FinanceForecastLine[],
  keys: readonly FinanceForecastLineKey[]
): FinanceForecastLine[] {
  const set = new Set<string>(keys)
  return lines.filter((l) => set.has(l.line_key))
}

export type ClientIdentityResult = {
  client_id: string
  client_name: string
  entityBillingFy: number
  mediaBreakoutFy: number
  mediaMatchesEntity: boolean
  feesFy: number
  commissionsFy: number
  otherRevenueFy: number
  revenueBodyExTotalFy: number
  feesPlusCommissionsFy: number
  feesCommissionsMatchRevenueExTotal: boolean
  feesCommissionsPlusOtherMatchRevenueExTotal: boolean
}

/**
 * Per-client identity:
 * - sum(media_billing) == sum(AA+AM) to the cent (monthly + FY)
 * - Fees + Commissions == revenue group ex total_revenue when other-revenue lines are $0;
 *   otherwise Fees + Commissions + Other == revenue body ex total (always, by construction).
 */
export function evaluateClientForecastIdentity(block: FinanceForecastClientBlock): ClientIdentityResult {
  const billing = billingGroupLines(block)
  const revenue = revenueGroupLines(block)

  const entity = billing.filter(isFinanceForecastEntityBillingLine)
  const media = billing.filter(isFinanceForecastMediaBreakoutLine)
  const entityBillingFy = sumLineFy(entity)
  const mediaBreakoutFy = sumLineFy(media)
  const mediaMatchesEntity =
    Math.abs(entityBillingFy - mediaBreakoutFy) <= CENT - 1e-9 && sumLineMonthlyEqual(entity, media)

  const fees = linesWithKeys(revenue, FINANCE_FORECAST_FEE_LINE_KEYS)
  const commissions = linesWithKeys(revenue, FINANCE_FORECAST_COMMISSION_LINE_KEYS)
  const other = linesWithKeys(revenue, FINANCE_FORECAST_OTHER_REVENUE_LINE_KEYS)
  const bodyExTotal = revenue.filter((l) => l.line_key !== FINANCE_FORECAST_LINE_KEYS.totalRevenue)

  const feesFy = sumLineFy(fees)
  const commissionsFy = sumLineFy(commissions)
  const otherRevenueFy = sumLineFy(other)
  const revenueBodyExTotalFy = sumLineFy(bodyExTotal)
  const feesPlusCommissionsFy = roundMoney2(feesFy + commissionsFy)

  const feesCommissionsMatchRevenueExTotal =
    Math.abs(feesPlusCommissionsFy - revenueBodyExTotalFy) <= CENT - 1e-9

  const feesCommissionsPlusOtherMatchRevenueExTotal =
    Math.abs(roundMoney2(feesPlusCommissionsFy + otherRevenueFy) - revenueBodyExTotalFy) <=
    CENT - 1e-9

  return {
    client_id: block.client_id,
    client_name: block.client_name,
    entityBillingFy,
    mediaBreakoutFy,
    mediaMatchesEntity,
    feesFy,
    commissionsFy,
    otherRevenueFy,
    revenueBodyExTotalFy,
    feesPlusCommissionsFy,
    feesCommissionsMatchRevenueExTotal,
    feesCommissionsPlusOtherMatchRevenueExTotal,
  }
}

export function evaluateDatasetForecastIdentity(dataset: FinanceForecastDataset): ClientIdentityResult[] {
  return dataset.client_blocks.map(evaluateClientForecastIdentity)
}

/** Hard gates used by FIN-5 tests: media == entity; Fees+Commissions+Other == revenue body ex total. */
export function assertClientForecastIdentity(block: FinanceForecastClientBlock): void {
  const r = evaluateClientForecastIdentity(block)
  if (!r.mediaMatchesEntity) {
    throw new Error(
      `FIN-5 media identity failed for ${r.client_name}: media ${r.mediaBreakoutFy} ≠ AA+AM ${r.entityBillingFy}`
    )
  }
  if (!r.feesCommissionsPlusOtherMatchRevenueExTotal) {
    throw new Error(
      `FIN-5 revenue cover failed for ${r.client_name}: Fees+Commissions+Other ${roundMoney2(
        r.feesPlusCommissionsFy + r.otherRevenueFy
      )} ≠ revenue body ${r.revenueBodyExTotalFy}`
    )
  }
  // When other revenue is zero, Fees+Commissions must equal the full revenue group ex total.
  if (Math.abs(r.otherRevenueFy) <= CENT - 1e-9 && !r.feesCommissionsMatchRevenueExTotal) {
    throw new Error(
      `FIN-5 Fees+Commissions identity failed for ${r.client_name}: ${r.feesPlusCommissionsFy} ≠ revenue body ${r.revenueBodyExTotalFy}`
    )
  }
}
