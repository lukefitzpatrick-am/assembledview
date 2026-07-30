import { toPeriodMonthKey } from "@/lib/finance/periods/monthKey"

/**
 * Retainer eligibility (decision 5):
 * - amount = clients.monthlyretainer; $0 stops
 * - optional retainer_end_month: active while period_month <= end
 * - changes apply from next OPEN period (already-run months keep snapshot) — caller enforces
 */
export function isRetainerActiveForPeriod(args: {
  monthlyRetainer: number | null | undefined
  retainerEndMonth: string | Date | null | undefined
  periodMonth: string
}): boolean {
  const amount = Number(args.monthlyRetainer)
  if (!Number.isFinite(amount) || amount <= 0) return false
  if (args.retainerEndMonth == null || args.retainerEndMonth === "") return true
  try {
    const end = toPeriodMonthKey(args.retainerEndMonth)
    const period = toPeriodMonthKey(args.periodMonth)
    return period <= end
  } catch {
    return true
  }
}

export function dollarsToCents(dollars: number): number {
  return Math.round(Number(dollars) * 100)
}
