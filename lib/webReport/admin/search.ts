import { matchTextAny } from "@/lib/search/matchText"
import type { AdminWebReportListRow } from "@/lib/webReport/admin/list"

/** Analytics page search: client name or slug. An empty query keeps every row. */
export function filterAdminWebReportRows(rows: AdminWebReportListRow[], query: string): AdminWebReportListRow[] {
  if (!query.trim()) return rows
  return rows.filter((row) => matchTextAny([row.clientName, row.slug], query))
}

/** Command palette entries: one per client that has a report row (draft or published). */
export function webSearchPaletteEntries(
  rows: AdminWebReportListRow[],
): Array<{ href: string; label: string; searchTerms: string }> {
  return rows
    .filter((row) => row.slug && row.status !== "none")
    .map((row) => ({
      href: `/dashboard/${encodeURIComponent(row.slug!)}/web`,
      label: `Web & search: ${row.clientName}`,
      searchTerms: `analytics web search ga4 search console ${row.slug} ${row.status}`,
    }))
}
