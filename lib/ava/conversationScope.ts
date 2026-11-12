/**
 * Where an Ava conversation lives (F14, B36). Pure: the chat widget and the
 * server both import it.
 */

/** Strips a query, hash and trailing slash. Empty or non-string → undefined. */
export function normaliseRoutePath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  let path = raw.trim()
  if (!path) return undefined
  const cut = path.search(/[?#]/)
  if (cut >= 0) path = path.slice(0, cut)
  if (path.length > 1) path = path.replace(/\/+$/, "")
  if (!path.startsWith("/") || path.length > 512) return undefined
  return path
}

/** `/tasks` and anything under `/tasks/`. Not `/tasksfoo`. */
export function isTasksPath(raw: unknown): boolean {
  const path = normaliseRoutePath(raw)
  if (!path) return false
  return path === "/tasks" || path.startsWith("/tasks/")
}

/** Conversation ids the server accepts: 8 to 64 of [A-Za-z0-9-]. Anything else → "". */
export function normaliseConversationId(raw: unknown): string {
  if (typeof raw !== "string") return ""
  const id = raw.trim()
  return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : ""
}

/** A new random conversation id (browser or Node). */
export function newConversationId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === "function") return c.randomUUID()
  let out = ""
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16)
  return out
}
