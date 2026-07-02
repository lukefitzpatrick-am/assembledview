import { formatMoney, parseMoneyInput } from "@/lib/format/money"
import {
  type InvestmentDisplayRow,
  monthKeyToDate,
} from "./prorateInvestmentDisplay"

export type InvestmentRow = InvestmentDisplayRow

/** Flatten per-channel rows, sum amounts by month key, return chronological display rows. */
export function mergeInvestmentMonths(
  byChannel: Record<string, InvestmentRow[]>,
): InvestmentRow[] {
  const totals = new Map<string, number>()

  for (const rows of Object.values(byChannel)) {
    for (const row of rows) {
      const amount = parseMoneyInput(row.amount) ?? 0
      totals.set(row.monthYear, (totals.get(row.monthYear) ?? 0) + amount)
    }
  }

  return Array.from(totals.entries())
    .sort((a, b) => monthKeyToDate(a[0]).getTime() - monthKeyToDate(b[0]).getTime())
    .map(([monthYear, amount]) => ({
      monthYear,
      amount: formatMoney(amount, { locale: "en-AU", currency: "AUD" }),
    }))
}
