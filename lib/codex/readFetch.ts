/**
 * C-200 (decision 3 B, B51): the one way code outside Tasks reaches the Codex
 * API. GET only: acting happens in /tasks. Lint refuses a /api/codex/ string
 * anywhere else outside the Tasks zone.
 */
type CodexReadPath = `tasks?${string}` | `time/summary?${string}`

export function codexGet(path: CodexReadPath, init: Omit<RequestInit, "method" | "body"> = {}): Promise<Response> {
  return fetch(`/api/codex/${path}`, { ...init, method: "GET", body: null })
}
