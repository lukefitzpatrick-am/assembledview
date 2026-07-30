/**
 * Shared Drizzle → Xano/API row shaping for shadow/postgres reads.
 */

/** Drizzle camelCase → Xano/API snake_case keys clients already consume. */
export function toApiRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
    out[snake] = value
  }
  return out
}

/**
 * Drizzle `numeric` columns come back as strings; Xano returns numbers.
 * Coerce finite numeric strings → numbers so postgres mode matches Xano shapes.
 * Skip `abn` (stored/served as text per migration contract).
 */
export function coerceNumericStringsToNumbers(
  row: Record<string, unknown>,
  options: { keepAsText?: ReadonlySet<string> } = {}
): Record<string, unknown> {
  const keep = options.keepAsText ?? new Set<string>()
  const out: Record<string, unknown> = { ...row }
  for (const [key, value] of Object.entries(out)) {
    if (keep.has(key)) {
      if (value != null) out[key] = String(value)
      continue
    }
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      const n = Number(value)
      if (Number.isFinite(n)) out[key] = n
    }
  }
  return out
}
