import { prorateAcrossMonths } from "./prorateAcrossMonths"
import { formatMoney } from "@/lib/format/money"

export type InvestmentBurstInput = { amount: number; start: Date | string; end: Date | string }
export type InvestmentDisplayRow = { monthYear: string; amount: string }

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]

/** "January 2026" … keys spanning [start,end] inclusive, chronological (English, to match prorateAcrossMonths' parser). */
export function monthKeysForRange(start: Date, end: Date): string[] {
  const keys: string[] = []
  let cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    keys.push(`${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`)
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return keys
}

export function monthKeyToDate(key: string): Date {
  const m = key.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!m) return new Date(0)
  return new Date(Number(m[2]), MONTHS.indexOf(m[1]), 1)
}

/** Aggregate prorated shares across bursts → Record<"January 2026", number>. */
export function aggregateInvestmentShares(bursts: InvestmentBurstInput[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const b of bursts) {
    const start = b.start instanceof Date ? b.start : new Date(b.start)
    const end = b.end instanceof Date ? b.end : new Date(b.end)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) continue
    const shares = prorateAcrossMonths({
      amount: b.amount, burstStart: start, burstEnd: end, monthKeys: monthKeysForRange(start, end),
    })
    for (const [k, v] of Object.entries(shares)) totals[k] = (totals[k] ?? 0) + v
  }
  return totals
}

/** Display rows, chronological, formatted (default AUD). */
export function aggregateInvestmentDisplayRows(
  bursts: InvestmentBurstInput[],
  formatFn: (n: number) => string = (n) => formatMoney(n, { locale: "en-AU", currency: "AUD" }),
): InvestmentDisplayRow[] {
  return Object.entries(aggregateInvestmentShares(bursts))
    .sort((a, b) => monthKeyToDate(a[0]).getTime() - monthKeyToDate(b[0]).getTime())
    .map(([monthYear, amount]) => ({ monthYear, amount: formatFn(amount) }))
}
