/** Normalise drizzle/postgres.js execute() result to a plain array. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }
  return []
}
