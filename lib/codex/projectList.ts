/**
 * Codex project list view (S1, B40, plan 4.2 "board and list on sections",
 * mock "List view"): pure. Rows grouped by section in board order, columns
 * title, assignee, due, priority and each custom field, sort and filter, and
 * the same `?view=list` toggle as the Tasks page. The filters live in the
 * page's query string so a link, a reload and a saved view (B37, screen
 * `project:<id>`) all show the same thing.
 *
 * Query keys: `view` (`list`, `board` or a saved view id), `q` (title
 * contains), `assignee` (an email, or `none`), `priority` (comma list),
 * `due` (`overdue`, `week` or `none`), `sort` (`title`, `assignee`, `due`,
 * `priority` or `field:<id>`, a leading `-` for descending) and
 * `field_<id>` (an option id, or `none`).
 */
import { sydneyTodayYmd } from "@/lib/codex/dueDate"
import { valueIds, valueLabels, type CodexCustomField, type CustomValues } from "@/lib/codex/customFields"
import { sortSections, type CodexSection } from "@/lib/codex/projects"
import type { CodexTask } from "@/lib/codex/types"

export const LIST_SORT_KEYS = ["title", "assignee", "due", "priority"] as const
export type ListSortColumn = (typeof LIST_SORT_KEYS)[number] | `field:${number}`
export type ListSort = { column: ListSortColumn; desc: boolean } | null

export const LIST_DUE_FILTERS = ["overdue", "week", "none"] as const
export type ListDueFilter = (typeof LIST_DUE_FILTERS)[number]

export const LIST_PRIORITIES = ["asap", "high", "normal", "low"] as const

export type ProjectListFilters = {
  q: string
  assignee: string | null
  priorities: string[]
  due: ListDueFilter | null
  /** Field id (text) to an option id or `none`. */
  fields: Record<string, string>
}

export type ProjectListState = { filters: ProjectListFilters; sort: ListSort }

export const EMPTY_LIST_FILTERS: ProjectListFilters = { q: "", assignee: null, priorities: [], due: null, fields: {} }

type Getter = { get(name: string): string | null; forEach?(cb: (value: string, key: string) => void): void }

const FIELD_PARAM = /^field_([1-9]\d{0,15})$/
const OPTION_ID = /^(o\d{1,9}|none)$/

export function parseListSort(raw: string | null | undefined): ListSort {
  const value = raw?.trim() ?? ""
  if (!value) return null
  const desc = value.startsWith("-")
  const column = desc ? value.slice(1) : value
  if ((LIST_SORT_KEYS as readonly string[]).includes(column)) return { column: column as ListSortColumn, desc }
  if (/^field:[1-9]\d{0,15}$/.test(column)) return { column: column as ListSortColumn, desc }
  return null
}

export function serializeListSort(sort: ListSort): string | null {
  return sort ? `${sort.desc ? "-" : ""}${sort.column}` : null
}

/** Reads the list's keys from a URLSearchParams-like object (unknown values dropped). */
export function parseProjectListParams(params: Getter | URLSearchParams): ProjectListState {
  const get = (k: string) => params.get(k)
  const q = (get("q") ?? "").trim().slice(0, 200)
  const assigneeRaw = (get("assignee") ?? "").trim().toLowerCase()
  const assignee = assigneeRaw === "none" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeRaw) ? assigneeRaw : null
  const priorities = (get("priority") ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p, i, all) => (LIST_PRIORITIES as readonly string[]).includes(p) && all.indexOf(p) === i)
  const dueRaw = get("due")
  const due = (LIST_DUE_FILTERS as readonly string[]).includes(dueRaw ?? "") ? (dueRaw as ListDueFilter) : null
  const fields: Record<string, string> = {}
  const each = (value: string, key: string) => {
    const m = FIELD_PARAM.exec(key)
    if (m && OPTION_ID.test(value.trim())) fields[m[1]] = value.trim()
  }
  if (params instanceof URLSearchParams) params.forEach(each)
  else params.forEach?.(each)
  return { filters: { q, assignee, priorities, due, fields }, sort: parseListSort(get("sort")) }
}

/** The list's keys as query pairs, in a fixed order (empty ones left out). */
export function serializeProjectListParams(state: ProjectListState): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const f = state.filters
  if (f.q.trim()) out.push(["q", f.q.trim()])
  if (f.assignee) out.push(["assignee", f.assignee])
  if (f.priorities.length > 0) out.push(["priority", f.priorities.join(",")])
  if (f.due) out.push(["due", f.due])
  for (const key of Object.keys(f.fields).sort((a, b) => Number(a) - Number(b))) {
    out.push([`field_${key}`, f.fields[key]])
  }
  const sort = serializeListSort(state.sort)
  if (sort) out.push(["sort", sort])
  return out
}

/** A saved view's stored filters for a project screen, as the page would write them (unknown keys dropped). */
export function canonicalProjectListFilters(raw: unknown): Record<string, string> {
  const params = new URLSearchParams()
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string" && value.length <= 200) params.set(key, value)
    }
  }
  return projectListFiltersRecord(parseProjectListParams(params))
}

/** Saved view filters for a project screen (B37 stores the query pairs as an object). */
export function projectListFiltersRecord(state: ProjectListState): Record<string, string> {
  return Object.fromEntries(serializeProjectListParams(state))
}

export function isListFiltered(filters: ProjectListFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.assignee != null ||
    filters.priorities.length > 0 ||
    filters.due != null ||
    Object.keys(filters.fields).length > 0
  )
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

export type ListRow = CodexTask & { custom_values?: CustomValues | null }

/** Rows that pass every filter. `today` is the Sydney civil date. */
export function filterListRows<T extends ListRow>(rows: readonly T[], filters: ProjectListFilters, today = sydneyTodayYmd()): T[] {
  const q = filters.q.trim().toLowerCase()
  const weekEnd = addDaysYmd(today, 7)
  return rows.filter((row) => {
    if (q && !String(row.title ?? "").toLowerCase().includes(q)) return false
    const assignee = (row.assignee_email ?? "").trim().toLowerCase()
    if (filters.assignee === "none" ? assignee !== "" : filters.assignee != null && assignee !== filters.assignee) return false
    if (filters.priorities.length > 0 && !filters.priorities.includes(String(row.priority ?? "normal"))) return false
    const due = row.due_on ?? row.due_date ?? null
    if (filters.due === "none" && due) return false
    if (filters.due === "overdue" && !(due && due < today && row.status !== "done")) return false
    if (filters.due === "week" && !(due && due >= today && due <= weekEnd)) return false
    for (const [fieldId, want] of Object.entries(filters.fields)) {
      const held = valueIds(row.custom_values ?? null, Number(fieldId))
      if (want === "none" ? held.length > 0 : !held.includes(want)) return false
    }
    return true
  })
}

const PRIORITY_RANK: Record<string, number> = { asap: 0, high: 1, normal: 2, low: 3 }

function sortValue(row: ListRow, column: ListSortColumn, fields: readonly CodexCustomField[]): string | number | null {
  switch (column) {
    case "title":
      return String(row.title ?? "").toLowerCase()
    case "assignee": {
      const name = (row.assignee_name || row.assignee_email || "").trim().toLowerCase()
      return name || null
    }
    case "due":
      return row.due_on ?? row.due_date ?? null
    case "priority":
      return PRIORITY_RANK[String(row.priority ?? "normal")] ?? 2
    default: {
      const id = Number(column.slice("field:".length))
      const field = fields.find((f) => f.id === id)
      if (!field) return null
      const held = valueIds(row.custom_values ?? null, id)
      if (held.length === 0) return null
      // Option order is the field's order (Not started before Done), not the label's.
      const index = field.options.findIndex((o) => o.id === held[0])
      return index < 0 ? null : index
    }
  }
}

/**
 * Sorted rows. Empty values go last in both directions. Ties, and no sort,
 * keep the board order (sort_order, then id).
 */
export function sortListRows<T extends ListRow>(rows: readonly T[], sort: ListSort, fields: readonly CodexCustomField[] = []): T[] {
  const boardOrder = (a: T, b: T) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) || Number(a.id) - Number(b.id)
  const out = [...rows]
  if (!sort) return out.sort(boardOrder)
  return out.sort((a, b) => {
    const va = sortValue(a, sort.column, fields)
    const vb = sortValue(b, sort.column, fields)
    if (va == null && vb == null) return boardOrder(a, b)
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return cmp === 0 ? boardOrder(a, b) : sort.desc ? -cmp : cmp
  })
}

/** `section` null is the "No section" group: project tasks without a section (B40fix). */
export type ListGroup<T> = { section: CodexSection | null; rows: T[]; total: number }

/** The key of project tasks without a section in `rowsBySection` and `totals` (the board's `unsectioned`). */
export const NO_SECTION_KEY = "none"

/**
 * Sections in board order, each with its filtered and sorted rows, then a
 * "No section" group (section null) when the project has tasks without a
 * section (rare: a section is deleted only when it has no live tasks).
 * `totals` is the server's count per section (for "showing n of m").
 */
export function groupListRows<T extends ListRow>(
  sections: readonly CodexSection[],
  rowsBySection: Readonly<Record<string, readonly T[]>>,
  state: ProjectListState,
  fields: readonly CodexCustomField[],
  totals: Readonly<Record<string, number>> = {},
  today = sydneyTodayYmd()
): ListGroup<T>[] {
  const group = (key: string, section: CodexSection | null): ListGroup<T> => ({
    section,
    rows: sortListRows(filterListRows(rowsBySection[key] ?? [], state.filters, today), state.sort, fields),
    total: totals[key] ?? (rowsBySection[key]?.length ?? 0),
  })
  const groups = sortSections(sections).map((section) => group(String(section.id), section))
  const loose = group(NO_SECTION_KEY, null)
  return loose.total > 0 || (rowsBySection[NO_SECTION_KEY]?.length ?? 0) > 0 ? [...groups, loose] : groups
}

/** A custom field cell: the labels joined. */
export function fieldCellText(field: CodexCustomField, row: ListRow): string {
  return valueLabels(field, row.custom_values ?? null).join(", ")
}
