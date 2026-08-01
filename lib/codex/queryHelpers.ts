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

/**
 * When mine=1, always use the session email — never a client-supplied assignee_email.
 */
export function resolveListAssigneeEmail(opts: {
  mine: boolean
  sessionEmail: string | null | undefined
  queryAssigneeEmail: string | null | undefined
}): string | undefined {
  if (opts.mine) {
    const email = opts.sessionEmail?.trim()
    return email ? email.toLowerCase() : undefined
  }
  const q = opts.queryAssigneeEmail?.trim()
  return q ? q.toLowerCase() : undefined
}
