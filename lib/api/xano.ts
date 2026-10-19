/**
 * Normalizes list responses: bare array `[{...}]` or wrapped
 * `{ data: [...] }`, `{ items: [...] }`, `{ result: [...] }`.
 */
/** Returns a list; items are untyped (row shapes vary by endpoint). */
export function parseXanoListPayload(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    if (Array.isArray(p.data)) return p.data
    if (Array.isArray(p.items)) return p.items
    if (Array.isArray(p.result)) return p.result
    // Some stacks nest once, e.g. { data: { items: [...] } }
    const innerData = p.data
    if (innerData && typeof innerData === "object") {
      const d = innerData as Record<string, unknown>
      if (Array.isArray(d.items)) return d.items
      if (Array.isArray(d.result)) return d.result
      if (Array.isArray(d.data)) return d.data
    }
  }
  return []
}
