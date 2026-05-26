import { formatCurrencyAUD } from "@/lib/format/currency"

export type StackedColumnCsvRow = {
  Month: string
  Category: string
  Amount: string
}

export type StackedColumnSeries = { key: string; label: string }

export const STACKED_COLUMN_CSV_COLUMNS = [
  { header: "Month", accessor: "Month" as const },
  { header: "Category", accessor: "Category" as const },
  { header: "Amount", accessor: "Amount" as const },
]

export function buildStackedColumnCsvRows(
  rows: Array<Record<string, string | number>>,
  series: StackedColumnSeries[],
  monthKey = "month",
): StackedColumnCsvRow[] {
  const out: StackedColumnCsvRow[] = []
  for (const row of rows) {
    const month = String(row[monthKey] ?? "")
    for (const s of series) {
      const amt = Number(row[s.key]) || 0
      if (amt <= 0) continue
      out.push({
        Month: month,
        Category: s.label,
        Amount: formatCurrencyAUD(amt),
      })
    }
  }
  return out
}
