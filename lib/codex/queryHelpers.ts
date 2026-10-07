/** Pure query helpers for Codex list routes (no DB / server-only). */

import { MY_WEEK_STATUSES, myWeekDueBefore } from "./quickAddParse.js"

export function clampPerPage(perPage?: number): number {
  if (perPage == null || !Number.isFinite(perPage) || perPage < 1) return 50
  return Math.min(Math.floor(perPage), 100)
}

export function clampPage(page?: number): number {
  if (page == null || !Number.isFinite(page) || page < 1) return 1
  return Math.floor(page)
}

/** Parse status query: single value or CSV. */
export function parseStatusFilter(raw: string | null): string[] | undefined {
  if (raw == null || raw.trim() === "") return undefined
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts : undefined
}

const TASK_PRIORITY_VALUES = new Set(["high", "normal", "low"])
const TASK_SOURCE_VALUES = new Set([
  "manual",
  "ava",
  "template",
  "recurring",
  "profile",
])
const CIVIL_YMD = /^\d{4}-\d{2}-\d{2}$/

function parseAllowlist(
  raw: string | null | undefined,
  allow: ReadonlySet<string>
): string[] {
  if (raw == null || raw.trim() === "") return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    const value = part.trim().toLowerCase()
    if (!allow.has(value) || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/** `priority` CSV. Unknown tokens are dropped. */
export function parseTaskPriorityFilter(raw: string | null | undefined): string[] {
  return parseAllowlist(raw, TASK_PRIORITY_VALUES)
}

/** `source` CSV. `profile` means source LIKE 'profile:%'. */
export function parseTaskSourceFilter(raw: string | null | undefined): string[] {
  return parseAllowlist(raw, TASK_SOURCE_VALUES)
}

/** Inclusive Sydney civil date, or null when the value is not YYYY-MM-DD. */
export function parseCivilYmd(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? ""
  return CIVIL_YMD.test(value) ? value : null
}

/** URL `sort` and GET /api/codex/tasks. Default is due date, soonest first. */
export const TASK_SORT_KEYS = [
  "due_asc",
  "due_desc",
  "created_desc",
  "updated_desc",
  "priority_desc",
] as const

export type TaskSortKey = (typeof TASK_SORT_KEYS)[number]

export const TASK_SORT_OPTIONS: { value: TaskSortKey; label: string }[] = [
  { value: "due_asc", label: "Due date" },
  { value: "due_desc", label: "Due date, latest" },
  { value: "created_desc", label: "Newest" },
  { value: "updated_desc", label: "Recently updated" },
  { value: "priority_desc", label: "Priority" },
]

const TASK_SORT_ALIASES: Record<string, TaskSortKey> = {
  due_asc: "due_asc",
  due_desc: "due_desc",
  created_desc: "created_desc",
  updated_desc: "updated_desc",
  priority_desc: "priority_desc",
  due_date_asc: "due_asc",
  due_date_desc: "due_desc",
  created_at_desc: "created_desc",
}

/** Canonical sort. Old API values stay valid as aliases. Unknown values are due_asc. */
export function parseTaskSort(raw: string | null | undefined): TaskSortKey {
  if (raw == null) return "due_asc"
  return TASK_SORT_ALIASES[raw.trim()] ?? "due_asc"
}

export type TaskSortable = {
  id?: number | string | null
  due_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  priority?: string | null
}

function priorityRank(priority: string | null | undefined): number {
  if (priority === "high") return 0
  if (priority === "normal") return 1
  if (priority === "low") return 2
  return 3
}

/** Null and blank dues sort after every dated row, in both directions. */
function compareDue(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc"
): number {
  const left = a?.trim() || null
  const right = b?.trim() || null
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (left === right) return 0
  const cmp = left < right ? -1 : 1
  return direction === "asc" ? cmp : -cmp
}

function compareTimeDesc(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const left = a?.trim() || null
  const right = b?.trim() || null
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (left === right) return 0
  return left < right ? 1 : -1
}

function compareIdDesc(a: TaskSortable, b: TaskSortable): number {
  const left = Number(a.id)
  const right = Number(b.id)
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return 0
  return right - left
}

/** Same order as listTasks, including the id desc tiebreak. */
export function compareTasksForSort(
  a: TaskSortable,
  b: TaskSortable,
  sort: string | null | undefined
): number {
  const key = parseTaskSort(sort)
  let cmp = 0
  if (key === "due_asc") cmp = compareDue(a.due_date, b.due_date, "asc")
  else if (key === "due_desc") cmp = compareDue(a.due_date, b.due_date, "desc")
  else if (key === "created_desc") cmp = compareTimeDesc(a.created_at, b.created_at)
  else if (key === "updated_desc") {
    cmp = compareTimeDesc(
      a.updated_at || a.created_at,
      b.updated_at || b.created_at
    )
  } else {
    cmp = priorityRank(a.priority) - priorityRank(b.priority)
    if (cmp === 0) cmp = compareDue(a.due_date, b.due_date, "asc")
  }
  return cmp !== 0 ? cmp : compareIdDesc(a, b)
}

export type CodexListAssigneeScope = {
  /**
   * Default "My tasks": assignee_email = me OR created_by_email = me
   * (includes unassigned tasks I created).
   */
  mineForEmail?: string
  /** Exact assignee filter for All-tasks + assignee email box (excludes null assignees). */
  assigneeEmail?: string
}

/**
 * Resolve list assignee scope for GET /api/codex/tasks.
 * When mine=1, always use the session email — never a client-supplied assignee_email.
 * Mine scope is assigned-to-me OR created-by-me (null assignee still visible if I created it).
 */
export function resolveListAssigneeScope(opts: {
  mine: boolean
  sessionEmail: string | null | undefined
  queryAssigneeEmail: string | null | undefined
}): CodexListAssigneeScope {
  if (opts.mine) {
    const email = opts.sessionEmail?.trim()
    return email ? { mineForEmail: email.toLowerCase() } : {}
  }
  const q = opts.queryAssigneeEmail?.trim()
  return q ? { assigneeEmail: q.toLowerCase() } : {}
}

/**
 * @deprecated Prefer {@link resolveListAssigneeScope}. Kept for older tests —
 * mine mode now returns session email but repo must use `mineForEmail` (OR created_by).
 */
export function resolveListAssigneeEmail(opts: {
  mine: boolean
  sessionEmail: string | null | undefined
  queryAssigneeEmail: string | null | undefined
}): string | undefined {
  const scope = resolveListAssigneeScope(opts)
  return scope.mineForEmail ?? scope.assigneeEmail
}

export type TasksFilterView = "list" | "board"

/** Last chosen layout. Convenience only — URL `view=` still wins. */
export const TASKS_LAYOUT_STORAGE_KEY = "codex.tasksLayout"

export function parseTasksLayoutValue(
  raw: string | null | undefined
): TasksFilterView | null {
  const view = raw?.trim().toLowerCase()
  return view === "list" || view === "board" ? view : null
}

export function resolveTasksFilterView(
  urlRaw: string | null | undefined,
  storedRaw?: string | null
): TasksFilterView {
  return parseTasksLayoutValue(urlRaw) ?? parseTasksLayoutValue(storedRaw) ?? "board"
}

export function readStoredTasksLayout(): TasksFilterView | null {
  try {
    if (typeof localStorage === "undefined") return null
    return parseTasksLayoutValue(localStorage.getItem(TASKS_LAYOUT_STORAGE_KEY))
  } catch {
    return null
  }
}

export function writeStoredTasksLayout(view: TasksFilterView): void {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(TASKS_LAYOUT_STORAGE_KEY, view)
  } catch {
    // Preference is a convenience, not state.
  }
}

export type TasksFilterParams = {
  mbaNumber: string | null
  clientId: string | null
  search: string | null
  assigneeEmail: string | null
  category: string | null
  statuses: string[] | null
  /** Default true (My tasks). false when `all=1` or `mine=0`. */
  mine: boolean
  myWeek: boolean
  view: TasksFilterView
  sort: TaskSortKey
  priorities: string[]
  overdue: boolean
  unassigned: boolean
  noClient: boolean
  createdByEmail: string | null
  dueFrom: string | null
  dueTo: string | null
  sources: string[]
}

/**
 * Compact toolbar + deep-link filters for `/tasks`.
 * Existing `?mba=` / `?client=` behaviour is preserved.
 */
export function parseTasksFilterParams(
  searchParams: {
    get(name: string): string | null
  },
  prefs?: { storedView?: string | null }
): TasksFilterParams {
  const mbaRaw = searchParams.get("mba")?.trim() ?? ""
  const clientRaw = searchParams.get("client")?.trim() ?? ""
  const search = searchParams.get("q")?.trim() || null
  const assigneeEmail = searchParams.get("assignee")?.trim().toLowerCase() || null
  const categoryRaw = searchParams.get("category")?.trim() || null
  const category =
    categoryRaw?.toLowerCase() === "none" ? "none" : categoryRaw
  const statuses = parseStatusFilter(searchParams.get("status")) ?? null
  const all = searchParams.get("all") === "1" || searchParams.get("mine") === "0"
  const myWeek = searchParams.get("week") === "1"
  const unassigned = searchParams.get("unassigned") === "1"
  const noClient = searchParams.get("no_client") === "1"
  const view = resolveTasksFilterView(
    searchParams.get("view"),
    prefs?.storedView
  )
  return {
    mbaNumber: mbaRaw.length > 0 ? mbaRaw : null,
    clientId:
      noClient || clientRaw.length === 0 || !/^\d+$/.test(clientRaw)
        ? null
        : clientRaw,
    search,
    assigneeEmail: unassigned ? null : assigneeEmail,
    category,
    statuses,
    mine: myWeek || unassigned ? false : !all,
    myWeek,
    view,
    sort: parseTaskSort(searchParams.get("sort")),
    priorities: parseTaskPriorityFilter(searchParams.get("priority")),
    overdue: searchParams.get("overdue") === "1",
    unassigned,
    noClient,
    createdByEmail:
      searchParams.get("created_by")?.trim().toLowerCase() || null,
    dueFrom: parseCivilYmd(searchParams.get("due_from")),
    dueTo: parseCivilYmd(searchParams.get("due_to")),
    sources: parseTaskSourceFilter(searchParams.get("source")),
  }
}

/**
 * Deep-link filters for `/tasks?mba=<mba_number>` and `/tasks?client=<id>`.
 * Combined with existing UI filters — does not imply clearing My Tasks / status.
 */
export function parseTasksDeepLinkParams(searchParams: {
  get(name: string): string | null
}): { mbaNumber: string | null; clientId: string | null } {
  const parsed = parseTasksFilterParams(searchParams)
  return { mbaNumber: parsed.mbaNumber, clientId: parsed.clientId }
}

function searchParamsWithoutTask(
  params: { toString(): string } | string
): URLSearchParams {
  const next = new URLSearchParams(
    typeof params === "string" ? params : params.toString()
  )
  next.delete("task")
  return next
}

/** Detail route with the current list filters. `task` is not a filter. */
export function taskDetailHref(
  id: number | string,
  params: { toString(): string } | string
): string {
  const qs = searchParamsWithoutTask(params).toString()
  const path = `/tasks/${encodeURIComponent(String(id))}`
  return qs ? `${path}?${qs}` : path
}

/** List route with the current filters. `task` is not a filter. */
export function taskListHref(params: { toString(): string } | string): string {
  const qs = searchParamsWithoutTask(params).toString()
  return qs ? `/tasks?${qs}` : "/tasks"
}

/** Serialize toolbar state to a query string (no leading `?`). Defaults omitted. */
export function serializeTasksFilterParams(filters: {
  mbaNumber?: string | null
  clientId?: string | null
  search?: string | null
  assigneeEmail?: string | null
  category?: string | null
  statuses?: string[] | null
  mine?: boolean
  myWeek?: boolean
  view?: TasksFilterView | null
  sort?: string | null
  priorities?: readonly string[] | null
  overdue?: boolean
  unassigned?: boolean
  noClient?: boolean
  createdByEmail?: string | null
  dueFrom?: string | null
  dueTo?: string | null
  sources?: readonly string[] | null
}): string {
  const params = new URLSearchParams()
  const mba = filters.mbaNumber?.trim()
  if (mba) params.set("mba", mba)
  const client = filters.clientId?.trim()
  if (!filters.noClient && client && /^\d+$/.test(client)) params.set("client", client)
  const q = filters.search?.trim()
  if (q) params.set("q", q)
  const assignee = filters.assigneeEmail?.trim().toLowerCase()
  if (assignee && !filters.myWeek && !filters.unassigned) params.set("assignee", assignee)
  const category = filters.category?.trim()
  if (category) params.set("category", category.toLowerCase() === "none" ? "none" : category)
  const statuses = (filters.statuses ?? []).map((s) => s.trim()).filter(Boolean)
  if (statuses.length > 0 && !filters.myWeek) params.set("status", statuses.join(","))
  if (filters.myWeek) params.set("week", "1")
  else if (filters.mine === false) params.set("all", "1")
  if (filters.view === "list") params.set("view", "list")
  const sort = parseTaskSort(filters.sort)
  if (sort !== "due_asc") params.set("sort", sort)
  const priorities = parseTaskPriorityFilter((filters.priorities ?? []).join(","))
  if (priorities.length > 0) params.set("priority", priorities.join(","))
  if (filters.overdue) params.set("overdue", "1")
  if (filters.unassigned && !filters.myWeek) params.set("unassigned", "1")
  if (filters.noClient) params.set("no_client", "1")
  const createdBy = filters.createdByEmail?.trim().toLowerCase()
  if (createdBy) params.set("created_by", createdBy)
  if (!filters.myWeek) {
    const dueFrom = parseCivilYmd(filters.dueFrom)
    const dueTo = parseCivilYmd(filters.dueTo)
    if (dueFrom) params.set("due_from", dueFrom)
    if (dueTo) params.set("due_to", dueTo)
  }
  const sources = parseTaskSourceFilter((filters.sources ?? []).join(","))
  if (sources.length > 0) params.set("source", sources.join(","))
  return params.toString()
}

export type TasksFilterState = {
  clientId: string
  mbaNumber: string
  search: string
  assigneeEmail: string
  category: string
  statuses: string[]
  mine: boolean
  myWeek: boolean
  priorities?: string[]
  overdue?: boolean
  unassigned?: boolean
  noClient?: boolean
  createdByEmail?: string
  dueFrom?: string
  dueTo?: string
  sources?: string[]
}

/** Default scope: My tasks, no status filter, no pinned assignee. */
export function exitMyWeekState(state: TasksFilterState): TasksFilterState {
  return {
    ...state,
    myWeek: false,
    mine: true,
    statuses: [],
    assigneeEmail: "",
    unassigned: false,
  }
}

/**
 * Other filters leave My week first, then apply their own change.
 * Turning My week on does not use this.
 */
export function applyTasksFilterChange(
  state: TasksFilterState,
  change: Partial<TasksFilterState>
): TasksFilterState {
  const base = state.myWeek ? exitMyWeekState(state) : state
  return { ...base, ...change }
}

/** GET /api/codex/tasks query. My week derives mine, status, and due_before. */
export function buildTasksFetchParams(input: {
  page: number
  perPage: number
  sort: string
  clientId?: string | null
  mbaNumber?: string | null
  category?: string | null
  q?: string | null
  assigneeEmail?: string | null
  statuses?: readonly string[] | null
  mine: boolean
  myWeek: boolean
  now?: Date
  priorities?: readonly string[] | null
  overdue?: boolean
  unassigned?: boolean
  noClient?: boolean
  createdByEmail?: string | null
  dueFrom?: string | null
  dueTo?: string | null
  sources?: readonly string[] | null
}): URLSearchParams {
  const params = new URLSearchParams()
  params.set("page", String(input.page))
  params.set("per_page", String(input.perPage))
  params.set("sort", input.sort)
  if (input.noClient) params.set("no_client", "1")
  else {
    const clientId = input.clientId?.trim()
    if (clientId) params.set("client_id", clientId)
  }
  const mba = input.mbaNumber?.trim()
  if (mba) params.set("mba_number", mba)
  const category = input.category?.trim()
  if (category) params.set("category", category)
  const q = input.q?.trim()
  if (q) params.set("q", q)
  const priorities = parseTaskPriorityFilter((input.priorities ?? []).join(","))
  if (priorities.length > 0) params.set("priority", priorities.join(","))
  const sources = parseTaskSourceFilter((input.sources ?? []).join(","))
  if (sources.length > 0) params.set("source", sources.join(","))
  const createdBy = input.createdByEmail?.trim().toLowerCase()
  if (createdBy) params.set("created_by", createdBy)
  if (input.myWeek) {
    params.set("mine", "1")
    params.set("status", MY_WEEK_STATUSES.join(","))
    params.set("due_before", myWeekDueBefore(input.now))
    return params
  }
  if (input.overdue) params.set("overdue", "1")
  const dueFrom = parseCivilYmd(input.dueFrom)
  const dueTo = parseCivilYmd(input.dueTo)
  if (dueFrom) params.set("due_after", dueFrom)
  if (dueTo) params.set("due_before", dueTo)
  const statuses = (input.statuses ?? []).map((s) => s.trim()).filter(Boolean)
  if (statuses.length > 0) params.set("status", statuses.join(","))
  if (input.unassigned) params.set("unassigned", "1")
  else if (input.mine) params.set("mine", "1")
  else if (input.assigneeEmail?.trim()) {
    params.set("assignee_email", input.assigneeEmail.trim())
  }
  return params
}

/** CSV of MBA numbers for GET /api/codex/tasks/counts?mba=A,B */
export function parseMbaNumbersQuery(raw: string | null): string[] {
  if (raw == null || raw.trim() === "") return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    const m = part.trim()
    if (!m || seen.has(m)) continue
    seen.add(m)
    out.push(m)
  }
  return out
}
