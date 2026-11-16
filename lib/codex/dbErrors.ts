/**
 * B43fix (R1): how a Codex write route reads a database failure. Pure, so
 * routes and tests import it without the store.
 *
 * - A lock conflict (Postgres stopped this write for a deadlock, 40P01, or
 *   could not take a lock, 55P03) is a 409 the person can retry: the whole
 *   transaction was rolled back, nothing changed.
 * - A database error's text (Drizzle's "Failed query: <sql> params: ...",
 *   or Postgres's own message) never reaches the client. The route logs it.
 *
 * Drizzle wraps the driver's error, so the SQLSTATE is on the error or on
 * its cause (as `sectionSync.followSectionRule` reads 55P03).
 */

/** SQLSTATEs that mean "someone else held the rows; try again". */
export const LOCK_CONFLICT_CODES: ReadonlySet<string> = new Set(["40P01", "55P03"])

export const LOCK_CONFLICT_MESSAGE = "Someone else was saving the same tasks at that moment. Nothing was changed. Try again."

/** The generic text that stands in for a database error's own message. */
export const DATABASE_ERROR_MESSAGE = "The database could not save this. Nothing was changed. Try again."

const SQLSTATE = /^[0-9A-Z]{5}$/

type ErrorLike = { name?: unknown; code?: unknown; message?: unknown; cause?: unknown }

/** The error and its causes, nearest first (at most four deep). */
function chain(error: unknown): ErrorLike[] {
  const out: ErrorLike[] = []
  let current: unknown = error
  for (let i = 0; i < 4 && current != null && typeof current === "object"; i++) {
    out.push(current as ErrorLike)
    current = (current as ErrorLike).cause
  }
  return out
}

/** The Postgres SQLSTATE on the error or its cause, or null. */
export function sqlStateOf(error: unknown): string | null {
  for (const e of chain(error)) {
    if (typeof e.code === "string" && SQLSTATE.test(e.code)) return e.code
  }
  return null
}

/** True for a deadlock (40P01) or a lock that could not be taken (55P03). */
export function isLockConflict(error: unknown): boolean {
  const code = sqlStateOf(error)
  return code != null && LOCK_CONFLICT_CODES.has(code)
}

/** True when the error came from the database (its text may carry SQL and values). */
export function isDatabaseError(error: unknown): boolean {
  if (sqlStateOf(error) != null) return true
  return chain(error).some(
    (e) =>
      e.name === "DrizzleQueryError" ||
      e.name === "PostgresError" ||
      (typeof e.message === "string" && e.message.startsWith("Failed query:"))
  )
}

/** The text a response may carry for `error`: its own message, never a database error's. */
export function safeErrorMessage(error: unknown): string {
  if (isDatabaseError(error)) return DATABASE_ERROR_MESSAGE
  return error instanceof Error ? error.message : String(error)
}
