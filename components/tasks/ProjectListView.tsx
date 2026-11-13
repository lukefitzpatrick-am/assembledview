"use client"

/**
 * A project's list view (B40, plan 4.2 "board and list on sections", mock
 * "List view"): the same tasks as the board, grouped by section in board
 * order, with columns title, assignee, assigned by, due, priority and one per
 * custom field. Sort by any column header (again for descending, a third
 * time for board order) and filter by text, assignee, priority, due and each
 * field. Presentational: ProjectBoardClient loads the rows and keeps the
 * state in the query string (so links and saved views carry it).
 */
import { Fragment } from "react"
import { ArrowDown, ArrowUp, ListTree } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CodexCustomField } from "@/lib/codex/customFields"
import { formatDueYmd, isOverdueYmd } from "@/lib/codex/dueDate"
import { sectionCategoryLabel } from "@/lib/codex/projectBoard"
import {
  EMPTY_LIST_FILTERS,
  fieldCellText,
  groupListRows,
  isListFiltered,
  type ListRow,
  type ListSortColumn,
  type ProjectListState,
} from "@/lib/codex/projectList"
import type { CodexSection } from "@/lib/codex/projects"
import { rosterDisplayName } from "@/lib/codex/rosterResolve"
import { TONE_TEXT } from "@/lib/design/status"
import { cn } from "@/lib/utils"

const ANY = "__any__"

const PRIORITY_LABEL: Record<string, string> = { asap: "ASAP", high: "High", normal: "Normal", low: "Low" }

/** Next sort after clicking a column header: ascending, descending, then none. */
export function nextListSort(current: ProjectListState["sort"], column: ListSortColumn): ProjectListState["sort"] {
  if (!current || current.column !== column) return { column, desc: false }
  if (!current.desc) return { column, desc: true }
  return null
}

export type ProjectListViewProps = {
  sections: CodexSection[]
  fields: CodexCustomField[]
  /** Loaded rows per section id (text). */
  rowsBySection: Record<string, ListRow[]>
  /** Server totals per section id (text), for "Load more". */
  totals: Record<string, number>
  state: ProjectListState
  onStateChange: (next: ProjectListState) => void
  onOpenTask: (task: ListRow) => void
  onLoadMore: (sectionId: number) => void
  loadingMoreId?: number | null
  meEmail: string | null
  today?: string
}

function person(email: string | null | undefined, name: string | null | undefined, meEmail: string | null): string {
  if (!email) return ""
  if (meEmail && email.toLowerCase() === meEmail.toLowerCase()) return "You"
  return rosterDisplayName({ name: name ?? null, email })
}

export function ProjectListView(props: ProjectListViewProps) {
  const { sections, fields, rowsBySection, totals, state, onStateChange, meEmail } = props
  const groups = groupListRows(sections, rowsBySection, state, fields, totals, props.today)
  const allRows = Object.values(rowsBySection).flat()
  const assignees = [...new Map(allRows.filter((r) => r.assignee_email).map((r) => [r.assignee_email!.toLowerCase(), r])).values()]
  const filters = state.filters
  const setFilters = (patch: Partial<ProjectListState["filters"]>) => onStateChange({ ...state, filters: { ...filters, ...patch } })
  const sortHeader = (column: ListSortColumn, label: string) => {
    const active = state.sort?.column === column
    return (
      <th scope="col" className="px-2 py-2 text-left font-semibold" aria-sort={active ? (state.sort!.desc ? "descending" : "ascending") : "none"}>
        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onStateChange({ ...state, sort: nextListSort(state.sort, column) })}>
          {label}
          {active ? state.sort!.desc ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden /> : null}
        </button>
      </th>
    )
  }
  const colCount = 5 + fields.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter the list">
        <Input
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
          placeholder="Filter by title"
          aria-label="Filter by title"
          className="h-8 w-48"
        />
        <Select value={filters.assignee ?? ANY} onValueChange={(v) => setFilters({ assignee: v === ANY ? null : v })}>
          <SelectTrigger className="h-8 w-44" aria-label="Assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any assignee</SelectItem>
            <SelectItem value="none">Unassigned</SelectItem>
            {assignees.map((r) => (
              <SelectItem key={r.assignee_email!} value={r.assignee_email!.toLowerCase()}>
                {person(r.assignee_email, r.assignee_name, meEmail)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.priorities[0] ?? ANY} onValueChange={(v) => setFilters({ priorities: v === ANY ? [] : [v] })}>
          <SelectTrigger className="h-8 w-36" aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any priority</SelectItem>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.due ?? ANY} onValueChange={(v) => setFilters({ due: v === "overdue" || v === "week" || v === "none" ? v : null })}>
          <SelectTrigger className="h-8 w-36" aria-label="Due">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any due date</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="week">Next 7 days</SelectItem>
            <SelectItem value="none">No due date</SelectItem>
          </SelectContent>
        </Select>
        {fields.map((f) => (
          <Select
            key={f.id}
            value={filters.fields[String(f.id)] ?? ANY}
            onValueChange={(v) => {
              const next = { ...filters.fields }
              if (v === ANY) delete next[String(f.id)]
              else next[String(f.id)] = v
              setFilters({ fields: next })
            }}
          >
            <SelectTrigger className="h-8 w-40" aria-label={`Filter ${f.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{`Any ${f.name}`}</SelectItem>
              <SelectItem value="none">{`No ${f.name}`}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {isListFiltered(filters) ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onStateChange({ ...state, filters: EMPTY_LIST_FILTERS })}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[48rem] text-sm" aria-label="Project tasks">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {sortHeader("title", "Task")}
              {sortHeader("assignee", "Assignee")}
              <th scope="col" className="px-2 py-2 text-left font-semibold">
                Assigned by
              </th>
              {sortHeader("due", "Due")}
              {sortHeader("priority", "Priority")}
              {fields.map((f) => (
                <Fragment key={f.id}>{sortHeader(`field:${f.id}`, f.name)}</Fragment>
              ))}
            </tr>
          </thead>
          {groups.map((group) => {
            const loaded = rowsBySection[String(group.section.id)]?.length ?? 0
            const more = Math.max(0, group.total - loaded)
            return (
              <tbody key={group.section.id} data-section={group.section.id}>
                <tr className="bg-surface-panel/60">
                  <th scope="rowgroup" colSpan={colCount} className="px-2 py-1.5 text-left text-xs font-semibold text-foreground">
                    {group.section.name} · {sectionCategoryLabel(group.section.status_category)}
                    <span className="num ml-2 font-normal text-muted-foreground">{group.rows.length}</span>
                  </th>
                </tr>
                {group.rows.map((row) => {
                  const due = row.due_on ?? row.due_date ?? null
                  const overdue = isOverdueYmd(due, row.status)
                  return (
                    <tr key={String(row.id)} className="border-t border-border/60 hover:bg-muted/30" data-task={String(row.id)}>
                      <td className="px-2 py-1.5">
                        <button type="button" className="text-left font-medium text-foreground hover:underline" onClick={() => props.onOpenTask(row)}>
                          {row.title}
                        </button>
                        {row.task_type === "milestone" ? (
                          <Badge variant="info" size="sm" className="ml-2">
                            Milestone
                          </Badge>
                        ) : null}
                        {(row.subtask_count ?? 0) > 0 ? (
                          <span className="num ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground" title="Subtasks">
                            <ListTree className="h-3 w-3" aria-hidden />
                            {row.subtask_count}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5">{person(row.assignee_email, row.assignee_name, meEmail) || <span className="text-muted-foreground">Unassigned</span>}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{person(row.assigned_by_email, null, meEmail)}</td>
                      <td className={cn("num px-2 py-1.5", overdue && `font-semibold ${TONE_TEXT.critical}`)}>{due ? formatDueYmd(due) : ""}</td>
                      <td className="px-2 py-1.5">{PRIORITY_LABEL[String(row.priority ?? "normal")] ?? String(row.priority)}</td>
                      {fields.map((f) => (
                        <td key={f.id} className="px-2 py-1.5">
                          {fieldCellText(f, row)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {group.rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-2 py-2 text-xs text-muted-foreground">
                      {isListFiltered(filters) && loaded > 0 ? "No tasks match the filters." : "No tasks."}
                    </td>
                  </tr>
                ) : null}
                {more > 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-2 py-1.5">
                      <Button type="button" variant="ghost" size="sm" disabled={props.loadingMoreId === group.section.id} onClick={() => props.onLoadMore(group.section.id)}>
                        {`Load more (${more} left)`}
                      </Button>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            )
          })}
        </table>
      </div>
    </div>
  )
}
