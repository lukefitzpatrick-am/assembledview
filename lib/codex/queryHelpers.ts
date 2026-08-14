/** Pure query helpers for Codex list routes (no DB / server-only). */

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
}

/**
 * Compact toolbar + deep-link filters for `/tasks`.
 * Existing `?mba=` / `?client=` behaviour is preserved.
 */
export function parseTasksFilterParams(searchParams: {
  get(name: string): string | null
}): TasksFilterParams {
  const mbaRaw = searchParams.get("mba")?.trim() ?? ""
  const clientRaw = searchParams.get("client")?.trim() ?? ""
  const search = searchParams.get("q")?.trim() || null
  const assigneeEmail = searchParams.get("assignee")?.trim().toLowerCase() || null
  const category = searchParams.get("category")?.trim() || null
  const statuses = parseStatusFilter(searchParams.get("status")) ?? null
  const all = searchParams.get("all") === "1" || searchParams.get("mine") === "0"
  const myWeek = searchParams.get("week") === "1"
  const viewRaw = searchParams.get("view")?.trim().toLowerCase()
  const view: TasksFilterView = viewRaw === "board" ? "board" : "list"
  return {
    mbaNumber: mbaRaw.length > 0 ? mbaRaw : null,
    clientId:
      clientRaw.length > 0 && /^\d+$/.test(clientRaw) ? clientRaw : null,
    search,
    assigneeEmail,
    category,
    statuses,
    mine: myWeek ? false : !all,
    myWeek,
    view,
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
}): string {
  const params = new URLSearchParams()
  const mba = filters.mbaNumber?.trim()
  if (mba) params.set("mba", mba)
  const client = filters.clientId?.trim()
  if (client && /^\d+$/.test(client)) params.set("client", client)
  const q = filters.search?.trim()
  if (q) params.set("q", q)
  const assignee = filters.assigneeEmail?.trim().toLowerCase()
  if (assignee && !filters.myWeek) params.set("assignee", assignee)
  const category = filters.category?.trim()
  if (category) params.set("category", category)
  const statuses = (filters.statuses ?? []).map((s) => s.trim()).filter(Boolean)
  if (statuses.length > 0 && !filters.myWeek) params.set("status", statuses.join(","))
  if (filters.myWeek) params.set("week", "1")
  else if (filters.mine === false) params.set("all", "1")
  if (filters.view === "board") params.set("view", "board")
  return params.toString()
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
