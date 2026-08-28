/**
 * Canonical form for comparing index predicates and column expressions.
 *
 * Identity is table + ordered columns + per-column direction + uniqueness +
 * this canonical predicate. Two objects match only when canonical forms are
 * EQUAL — "appears on both sides" is never automatic equivalence.
 *
 * Canonicalisation covers how SQL is WRITTEN (casts, wrapping parens,
 * whitespace, quoting). It must not erase what the object DOES (column order,
 * ASC/DESC, partial predicates).
 */
export function canonicalise(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/"/g, "")
    .replace(/\bpublic\./g, "")
    .replace(/\b[a-z_][a-z0-9_]*\./g, "")
    .replace(/::[a-z_][a-z0-9_]*(?:\[\])?/g, "")
    .replace(/\s+/g, " ")
    .trim()

  s = stripRedundantParens(s)
  return s.replace(/\s+/g, " ").trim()
}

function stripRedundantParens(input: string): string {
  let s = input
  let prev = ""
  while (s !== prev) {
    prev = s
    const unwrapped = unwrapOuterParens(s)
    if (unwrapped !== null) {
      s = unwrapped
      continue
    }
    s = s.replace(/\(\s*([a-z_][a-z0-9_]*)\s*\)/g, "$1")
    s = stripRedundantGroupingParens(s)
    s = s.replace(/\s+/g, " ").trim()
  }
  return s
}

function isIdentChar(ch: string | undefined): boolean {
  return ch != null && /[a-z0-9_]/.test(ch)
}

/**
 * Unwrap grouping parentheses whose inner expression has no AND/OR.
 * Function-call parens (`btrim(...)`) are kept. `(a OR b) AND c` keeps
 * the inner pair because it changes binding.
 */
function stripRedundantGroupingParens(s: string): string {
  const opens: number[] = []
  const pairs: Array<{ start: number; end: number }> = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") opens.push(i)
    else if (s[i] === ")" && opens.length > 0) {
      pairs.push({ start: opens.pop()!, end: i })
    }
  }

  const drop = new Set<number>()
  for (const { start, end } of pairs) {
    if (isIdentChar(s[start - 1])) continue
    const inner = s.slice(start + 1, end)
    if (/\b(and|or)\b/.test(inner)) continue
    drop.add(start)
    drop.add(end)
  }
  if (drop.size === 0) return s
  return [...s].filter((_, i) => !drop.has(i)).join("")
}

/** Unwrap a single pair of parens that wrap the entire string. */
export function unwrapOuterParens(s: string): string | null {
  if (s.length < 2 || s[0] !== "(" || s[s.length - 1] !== ")") return null
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0 && i < s.length - 1) return null
      if (depth < 0) return null
    }
  }
  if (depth !== 0) return null
  return s.slice(1, -1).trim()
}
