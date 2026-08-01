/**
 * Shared tolerant text match for user-facing search bars.
 *
 * - Case-insensitive, diacritic-insensitive, whitespace-normalised
 * - Multi-token AND with token-prefix ("mitch win" → "Mitchelton Winery")
 * - Substring fallback on the full haystack (identifiers like mba "001001" / "1001")
 * - All inputs coerced via `String(x ?? "")` — never throws on null/number fields
 *
 * No Levenshtein / ranked fuzzy yet — see module comment in tests / brain.
 */

/** Collapse case, diacritics, and runs of whitespace. Safe for any value. */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Whitespace-split query tokens after normalisation. Empty query → []. */
export function tokenizeSearchQuery(query: unknown): string[] {
  const n = normalizeSearchText(query)
  if (!n) return []
  return n.split(" ").filter(Boolean)
}

function tokenMatchesHaystack(
  hayNorm: string,
  hayTokens: string[],
  queryToken: string
): boolean {
  if (hayTokens.some((t) => t.startsWith(queryToken))) return true
  // Contiguous identifiers / partial MBA numbers (e.g. "1001" in "001001")
  if (hayNorm.includes(queryToken)) return true
  return false
}

/**
 * True when every query token matches the haystack (token-prefix or substring).
 * Empty / whitespace-only query matches everything.
 */
export function matchText(haystack: unknown, query: unknown): boolean {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return true
  const hayNorm = normalizeSearchText(haystack)
  if (!hayNorm) return false
  const hayTokens = hayNorm.split(" ").filter(Boolean)
  return tokens.every((qt) => tokenMatchesHaystack(hayNorm, hayTokens, qt))
}

/**
 * OR across fields: true if any single field satisfies the full multi-token query.
 * Empty query matches. Null/undefined fields are treated as "".
 */
export function matchTextAny(fields: readonly unknown[], query: unknown): boolean {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return true
  return fields.some((field) => matchText(field, query))
}
