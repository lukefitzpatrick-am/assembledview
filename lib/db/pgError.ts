/**
 * How the app reads a Postgres failure (B49; was `lib/codex/dbErrors.ts`,
 * B43fix R1, plus six private `isUniqueViolation` copies). Pure, so routes
 * and tests import it without a database.
 *
 * Drizzle and postgres-js wrap the driver's error, so the SQLSTATE can be on
 * the error or on a cause. Every check reads the error and its causes.
 * A database error's own text (Drizzle's "Failed query: <sql> params: ...",
 * or Postgres's message) never reaches a client: `safeErrorMessage`.
 */

const SQLSTATE = /^[0-9A-Z]{5}$/

type ErrorLike = { name?: unknown; code?: unknown; message?: unknown; cause?: unknown; constraint_name?: unknown; constraint?: unknown }

/** The error and its causes, nearest first (at most five deep). */
function chain(error: unknown): ErrorLike[] {
  const out: ErrorLike[] = []
  let current: unknown = error
  for (let i = 0; i < 5 && current != null && typeof current === "object"; i++) {
    out.push(current as ErrorLike)
    current = (current as ErrorLike).cause
  }
  return out
}

function hasState(error: unknown, code: string): boolean {
  return chain(error).some((e) => e.code === code)
}

/** The nearest Postgres SQLSTATE on the error or its causes, or null. */
export function sqlStateOf(error: unknown): string | null {
  for (const e of chain(error)) {
    if (typeof e.code === "string" && SQLSTATE.test(e.code)) return e.code
  }
  return null
}

/**
 * 23505 on the error or a cause. With no SQLSTATE anywhere, a message that
 * says "duplicate key" or "unique constraint" counts (an error rethrown
 * without its code). With `constraint`, only a 23505 naming that constraint
 * (in `constraint_name`, `constraint` or the message) counts.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const errors = chain(error)
  if (constraint) {
    return errors.some((e) => e.code === "23505" && String(e.constraint_name ?? e.constraint ?? e.message ?? "").includes(constraint))
  }
  if (errors.some((e) => e.code === "23505")) return true
  return sqlStateOf(error) == null && errors.some((e) => /duplicate key|unique constraint/i.test(String(e.message ?? "")))
}

/** 42703 undefined column (a migration that has not run). */
export function isMissingColumn(error: unknown): boolean {
  return hasState(error, "42703")
}

/** 42P01 undefined table (a migration that has not run). */
export function isMissingRelation(error: unknown): boolean {
  return hasState(error, "42P01")
}

/** A deadlock (40P01) or a lock that could not be taken (55P03): nothing changed, the person can retry. */
export function isLockConflict(error: unknown): boolean {
  const code = sqlStateOf(error)
  return code === "40P01" || code === "55P03"
}

/** The generic text that stands in for a database error's own message. */
export const DATABASE_ERROR_MESSAGE = "The database could not save this. Nothing was changed. Try again."

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
