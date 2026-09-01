/**
 * Mirror-ahead column check — the CB-0 class of failure.
 *
 * Drizzle emits an explicit column list, not SELECT *. A column named in
 * db/schema/*.ts is selected by every db.select() on that table. If the
 * database does not have it yet, every read path 500s.
 *
 * Live `db:drift` still compares both directions (DB-ahead and mirror-ahead).
 * This helper is the loud half: columns the TypeScript mirror declares that
 * information_schema lacks.
 */

export type NamedColumn = { table: string; column: string }

export function columnKey(col: NamedColumn): string {
  return `${col.table}.${col.column}`
}

export function findMirrorColumnsMissingFromLive(
  mirror: Iterable<NamedColumn>,
  live: Iterable<NamedColumn>,
): NamedColumn[] {
  const liveSet = new Set<string>()
  for (const col of live) liveSet.add(columnKey(col))

  const missing: NamedColumn[] = []
  const seen = new Set<string>()
  for (const col of mirror) {
    const key = columnKey(col)
    if (seen.has(key)) continue
    seen.add(key)
    if (!liveSet.has(key)) missing.push({ table: col.table, column: col.column })
  }
  return missing.toSorted((a, b) => columnKey(a).localeCompare(columnKey(b)))
}

export function formatMirrorAheadMessage(missing: NamedColumn[]): string {
  if (missing.length === 0) return ""
  const lines = [
    "FATAL: the Drizzle mirror declares columns the database lacks.",
    "Drizzle emits an explicit column list, not SELECT *.",
    "Deploying this mirror will 500 every db.select() on those tables.",
    "Apply the migration BEFORE this mirror edit deploys. Authoring is not a safe half-step.",
    "",
    ...missing.map((col) => `  ${columnKey(col)}`),
  ]
  return lines.join("\n")
}
