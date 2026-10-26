/**
 * Pure view model for the billing change log (design 6.3).
 */
import { centsLabel, monthShort } from "./panelModel"

export type RevisionLogRowDto = {
  id: number
  createdAt: string
  mbaNumber: string
  mode: string
  reason: string
  source: string
  status: string
  createdByName: string | null
  baseVersionNumber: number
  newVersionNumber: number | null
  movedCents: number
  restoresRevisionId: number | null
  diff: unknown
}

const MODE_LABELS: Record<string, string> = {
  bill_amount: "Bill ahead",
  bill_remainder: "Bill the remainder",
  pull_month: "Pull a month",
  underspend: "Underspend",
  restore: "Undo",
}

export function sydneyDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d)
}

type DiffMonth = { month: string; total?: { before: number; after: number } }
type DiffLine = { lineItemId: string; label?: string; media?: Array<{ month: string; before: number; after: number }> }
type Diff = { months?: DiffMonth[]; lines?: DiffLine[]; credits?: Array<{ lineItemId: string; month: string; cents: number }> }

export type RevisionLogItem = {
  id: number
  when: string
  who: string
  source: "UI" | "Ava"
  mode: string
  reason: string
  versions: string
  moved: string
  monthsChanged: string[]
  status: string
  canUndo: boolean
  lines: Array<{ lineItemId: string; label: string; cells: string[] }>
  credits: string[]
}

export function summariseRevision(row: RevisionLogRowDto, latestAppliedId: number | null): RevisionLogItem {
  const diff = (row.diff ?? {}) as Diff
  const months = (diff.months ?? []).filter((m) => m.total && m.total.before !== m.total.after).map((m) => m.month)
  return {
    id: row.id,
    when: sydneyDateTime(row.createdAt),
    who: row.createdByName ?? "Unknown",
    source: row.source === "ava" ? "Ava" : "UI",
    mode: MODE_LABELS[row.mode] ?? row.mode,
    reason: row.reason,
    versions: row.newVersionNumber != null ? `v${row.baseVersionNumber} → v${row.newVersionNumber}` : `v${row.baseVersionNumber} (note only)`,
    moved: centsLabel(row.movedCents),
    monthsChanged: months.map(monthShort),
    status: row.status === "restored" ? "Undone" : row.status === "noted" ? "Credit noted" : "Applied",
    canUndo: row.status === "applied" && row.newVersionNumber != null && row.id === latestAppliedId,
    lines: (diff.lines ?? [])
      .filter((l) => (l.media ?? []).length > 0)
      .map((l) => ({
        lineItemId: l.lineItemId,
        label: l.label ?? l.lineItemId,
        cells: (l.media ?? []).map((c) => `${monthShort(c.month)} ${centsLabel(c.before)} → ${centsLabel(c.after)}`),
      })),
    credits: (diff.credits ?? []).map((c) => `${c.lineItemId} ${monthShort(c.month)}: credit ${centsLabel(c.cents)}`),
  }
}

/** Only the newest applied revision with a version can be undone (it must still be the tip). */
export function summariseRevisionLog(rows: RevisionLogRowDto[]): RevisionLogItem[] {
  const latest = rows.find((r) => r.status === "applied" && r.newVersionNumber != null)?.id ?? null
  return rows.map((r) => summariseRevision(r, latest))
}
