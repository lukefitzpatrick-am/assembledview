type DailyRow = Record<string, string | number>

export function aggregateDailyRows(rows: DailyRow[], numericKeys: string[]): DailyRow[] {
  const byDate = new Map<string, DailyRow>()
  for (const row of rows) {
    const date = String(row.date ?? "")
    if (!date) continue
    const existing = byDate.get(date) ?? { date }
    for (const key of numericKeys) {
      const prev = Number(existing[key] ?? 0)
      const add = Number(row[key] ?? 0)
      existing[key] = prev + (Number.isFinite(add) ? add : 0)
    }
    byDate.set(date, existing)
  }
  return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
}
