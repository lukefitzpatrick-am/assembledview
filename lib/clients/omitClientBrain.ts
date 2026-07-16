/**
 * Strip multi-KB `client_brain` from list-level client rows.
 * Sets `has_client_brain` so the hub grid can show coverage without the blob.
 */

export function hasNonEmptyClientBrain(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false
  const brain = (raw as Record<string, unknown>).client_brain
  return typeof brain === "string" && brain.trim().length > 0
}

export function omitClientBrain<T extends Record<string, unknown>>(
  raw: T,
): T & { has_client_brain: boolean } {
  const has = hasNonEmptyClientBrain(raw)
  const {
    client_brain: _dropBrain,
    client_brain_updated_at: _dropUpdatedAt,
    ...rest
  } = raw as T & {
    client_brain?: unknown
    client_brain_updated_at?: unknown
  }
  return {
    ...(rest as T),
    has_client_brain: has,
  }
}

export function omitClientBrainFromList(rows: unknown[]): any[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row
    return omitClientBrain(row as Record<string, unknown>)
  })
}
