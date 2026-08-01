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
