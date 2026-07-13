import type { TaxonomyRow } from "@/lib/planning/adapter"

export type TaxonomyGroup = {
  level1: string
  rows: TaxonomyRow[]
}

/** Group taxonomy rows by level1, preserving first-seen group order and sortOrder within group. */
export function groupTaxonomy(rows: TaxonomyRow[]): TaxonomyGroup[] {
  const order: string[] = []
  const byLevel = new Map<string, TaxonomyRow[]>()
  for (const row of rows) {
    const key = row.level1 || "Other"
    if (!byLevel.has(key)) {
      byLevel.set(key, [])
      order.push(key)
    }
    byLevel.get(key)!.push(row)
  }
  for (const list of byLevel.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder)
  }
  return order.map((level1) => ({
    level1,
    rows: byLevel.get(level1)!,
  }))
}

export function fmtReachPct(pct: number): string {
  if (!(pct > 0)) return "—"
  return `${Math.round(pct * 100)}%`
}
