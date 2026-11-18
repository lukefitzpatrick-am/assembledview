/**
 * Temporary source pin. Delete when usePlanForm owns this wiring (S33 next batch).
 *
 * Reader for the two marked page wiring tests (C-280). It finds a call in a
 * page and returns its arguments, so a test can pin each argument the page
 * passes into `_form`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export function pageSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const OPEN = "([{"
const CLOSE = ")]}"

/** The text inside the parentheses of the call that starts at `anchor` (the nth match). */
export function callText(src: string, anchor: string, nth = 0): string {
  let at = -1
  for (let i = 0; i <= nth; i++) at = src.indexOf(anchor, at + 1)
  assert.ok(at >= 0, `${anchor} (match ${nth}) not found`)
  const open = src.indexOf("(", at + anchor.length - 1)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!
    if (ch === '"' || ch === "'" || ch === "`") {
      i = src.indexOf(ch, i + 1)
      continue
    }
    if (OPEN.includes(ch)) depth++
    if (CLOSE.includes(ch)) depth--
    if (depth === 0) return src.slice(open + 1, i)
  }
  throw new Error(`${anchor}: unbalanced`)
}

/** Top-level arguments (or object entries), comments dropped and spaces collapsed. */
export function entries(text: string): string[] {
  let body = text.replace(/\/\/[^\n]*/g, "").trim()
  if (body.startsWith("{") && body.endsWith("}")) body = body.slice(1, -1)
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (ch === '"' || ch === "'" || ch === "`") {
      i = body.indexOf(ch, i + 1)
      continue
    }
    if (OPEN.includes(ch)) depth++
    if (CLOSE.includes(ch)) depth--
    if (ch === "," && depth === 0) {
      out.push(body.slice(start, i))
      start = i + 1
    }
  }
  out.push(body.slice(start))
  return out.map((e) => e.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim()).filter(Boolean)
}

/** How many times `needle` occurs. */
export function count(src: string, needle: string): number {
  return src.split(needle).length - 1
}

/** B57: the over budget question, asked through `useConfirm`; no stops the save. */
export const OVER_BUDGET = "if (!(await confirm(overBudgetQuestion(budgetRemaining)))) return"
