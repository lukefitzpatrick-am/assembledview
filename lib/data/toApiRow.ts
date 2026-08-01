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
 * Text identifier fields that must never be numerically coerced.
 * Leading zeros / phone-like digits are load-bearing (mba_number "001001" ≠ 1001).
 * Prefer extending this set over an allowlist of numeric columns — drizzle `numeric`
 * strings still coerce; only known text identifiers are excluded.
 */
export const IDENTIFIER_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "mba_number",
  "po_number",
  "abn",
  "postcode",
  "invoice_number",
  "invoice_key",
  "client_contact",
  "mbaidentifier",
  "line_item_id",
  "mp_plannumber",
])

/**
 * Drizzle `numeric` columns come back as strings; Xano returns numbers.
 * Coerce finite numeric strings → numbers so postgres mode matches Xano shapes.
 * Identifier/text fields in IDENTIFIER_TEXT_FIELDS (plus options.keepAsText) stay strings.
 */
export function coerceNumericStringsToNumbers(
  row: Record<string, unknown>,
  options: { keepAsText?: ReadonlySet<string> } = {}
): Record<string, unknown> {
  const keep = new Set<string>(IDENTIFIER_TEXT_FIELDS)
  if (options.keepAsText) {
    for (const key of options.keepAsText) keep.add(key)
  }
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
