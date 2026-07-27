import type { NamingTemplate, TemplateElement } from "./types"

/**
 * Map of template element keys → Excel formula fragments.
 *
 * Typical shapes (caller-owned layout):
 * - globals: `'Input sheet'!$B$1` (absolute)
 * - per-row: `'Input sheet'!$E$7` (locked col + row)
 * - local: `$C14` (channel tab cell)
 *
 * Literals are taken from the template (quoted), not from refs.
 */
export type FormulaRefs = Record<string, string>

type FormulaToken =
  | { kind: "atom"; expr: string }
  | { kind: "optional"; expr: string }

function resolveToken(
  element: TemplateElement,
  refs: FormulaRefs,
): FormulaToken | null {
  if (element.source === "literal") {
    const lit = String(element.literal ?? element.key)
    return { kind: "atom", expr: `"${lit}"` }
  }

  const ref = refs[element.key]
  if (ref === undefined || ref === null) {
    if (element.optional) return null
    throw new Error(`Missing formula ref for required element: ${element.key}`)
  }

  const trimmed = String(ref).trim()
  if (!trimmed) {
    if (element.optional) return null
    throw new Error(`Empty formula ref for required element: ${element.key}`)
  }

  // Optional elements AND required free fields use IF so a blank cell does not
  // leave a dangling separator (value column shows ← add … in AV for required free).
  if (element.optional || element.source === "free") {
    // Master pattern: IF(E17<>"","-"&E17,"") — leading separator lives inside the IF
    return {
      kind: "optional",
      expr: `IF(${trimmed}<>"","-"&${trimmed},"")`,
    }
  }

  return { kind: "atom", expr: trimmed }
}

/**
 * Walk `template.elements` in order and build
 * `=LOWER(part1&"-"&part2&…)` mirroring the master naming workbook.
 *
 * Optional elements and required free elements with a ref become
 * `IF(ref<>"","-"&ref,"")` so blanks do not leave dangling separators.
 * Optional elements with no ref are omitted (same as `composeName` skipping
 * empty optionals).
 */
export function composeFormula(
  template: NamingTemplate,
  refs: FormulaRefs,
): string {
  const tokens: FormulaToken[] = []

  for (const element of template.elements) {
    const token = resolveToken(element, refs)
    if (!token) continue
    tokens.push(token)
  }

  if (tokens.length === 0) {
    throw new Error(
      `composeFormula: no elements resolved for ${template.platform}/${template.level}`,
    )
  }

  let body = ""
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (i === 0) {
      if (token.kind === "optional") {
        // Leading optional: no prior segment to dash onto — emit bare IF without leading "-"
        const inner = token.expr.replace(
          /^IF\((.+)<>\"\",\"-\"&\1,\"\"\)$/,
          'IF($1<>"",$1,"")',
        )
        body = inner
      } else {
        body = token.expr
      }
      continue
    }
    if (token.kind === "optional") {
      body += `&${token.expr}`
    } else {
      body += `&"-"&${token.expr}`
    }
  }

  return `=LOWER(${body})`
}

/**
 * Evaluate a `composeFormula` result against cell values (test / parity helper).
 * Does not invoke Excel — concatenates & resolves IF(blank) the same way.
 */
export function evaluateNamingFormula(
  formula: string,
  cells: Record<string, string>,
): string {
  const match = formula.match(/^=LOWER\(([\s\S]*)\)$/)
  if (!match) {
    throw new Error(`evaluateNamingFormula: expected =LOWER(...), got ${formula}`)
  }
  const joined = evalConcat(match[1], cells)
  return joined.toLowerCase()
}

/** Split on top-level `&` (not inside quotes or IF(...)). */
function splitTopLevelAmpersand(expr: string): string[] {
  const parts: string[] = []
  let buf = ""
  let depth = 0
  let inQuote = false

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === '"' && expr[i - 1] !== "\\") {
      inQuote = !inQuote
      buf += ch
      continue
    }
    if (!inQuote) {
      if (ch === "(") depth++
      if (ch === ")") depth = Math.max(0, depth - 1)
      if (ch === "&" && depth === 0) {
        parts.push(buf.trim())
        buf = ""
        continue
      }
    }
    buf += ch
  }
  if (buf.trim()) parts.push(buf.trim())
  return parts
}

function evalConcat(expr: string, cells: Record<string, string>): string {
  return splitTopLevelAmpersand(expr)
    .map((part) => evalAtom(part, cells))
    .join("")
}

function evalAtom(atom: string, cells: Record<string, string>): string {
  if (atom.startsWith("IF(") && atom.endsWith(")")) {
    // IF(ref<>"","-"&ref,"")  or  IF(ref<>"",ref,"")
    const withDash = atom.match(
      /^IF\((.+)<>\"\",\"-\"&(.+),\"\"\)$/,
    )
    if (withDash) {
      const ref = withDash[1]
      const value = lookupCell(ref, cells)
      return value ? `-${value}` : ""
    }
    const bare = atom.match(/^IF\((.+)<>\"\",(.+),\"\"\)$/)
    if (bare) {
      const ref = bare[1]
      const value = lookupCell(ref, cells)
      return value || ""
    }
    throw new Error(`evaluateNamingFormula: unsupported IF form: ${atom}`)
  }

  if (atom.startsWith('"') && atom.endsWith('"')) {
    return atom.slice(1, -1)
  }

  return lookupCell(atom, cells)
}

function lookupCell(ref: string, cells: Record<string, string>): string {
  if (Object.prototype.hasOwnProperty.call(cells, ref)) {
    return String(cells[ref] ?? "")
  }
  // Allow quoted string mistaken as ref
  if (ref.startsWith('"') && ref.endsWith('"')) {
    return ref.slice(1, -1)
  }
  throw new Error(`evaluateNamingFormula: unknown cell ref: ${ref}`)
}
