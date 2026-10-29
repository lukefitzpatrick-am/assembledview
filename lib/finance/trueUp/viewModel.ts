/**
 * True-up page model (pure, client-safe). Month options, the row filter and
 * the one-line suggestion per MBA.
 */

import {
  TRUE_UP_COMPONENTS,
  TRUE_UP_COMPONENT_LABELS,
  addMonths,
  defaultTrueUpAsOf,
  needsAction,
  type TrueUpMbaRow,
} from "./compute"

export type TrueUpView = "action" | "all"

/** Sydney calendar date, YYYY-MM-DD. */
export function sydneyTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/** The default as-of month and the 11 before it, newest first. */
export function trueUpMonthOptions(todayIso: string): string[] {
  const latest = defaultTrueUpAsOf(todayIso)
  return Array.from({ length: 12 }, (_, i) => addMonths(latest, -i))
}

export function trueUpMonthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })
}

export function filterTrueUpRows(rows: TrueUpMbaRow[], view: TrueUpView, search: string): TrueUpMbaRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (view === "action" && !needsAction(row.status)) return false
    if (!q) return true
    return (
      row.clientName.toLowerCase().includes(q) ||
      row.mbaNumber.toLowerCase().includes(q) ||
      row.campaignName.toLowerCase().includes(q)
    )
  })
}

/** "Fee: Spread the charge over the remaining months" for each component that isn't matching. */
export function trueUpRowSuggestions(row: TrueUpMbaRow): string[] {
  const out: string[] = []
  for (const c of TRUE_UP_COMPONENTS) {
    const s = row.components[c]
    if (s.status === "matches" || !s.suggestion) continue
    out.push(`${TRUE_UP_COMPONENT_LABELS[c]}: ${s.suggestion}`)
  }
  return out
}
