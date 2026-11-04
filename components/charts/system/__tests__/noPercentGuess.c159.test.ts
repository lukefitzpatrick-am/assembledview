import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

/**
 * C-159: charts never guess a percent unit from the number's size. `percent`
 * is a ratio (1 = 100%); points are `percentPoints` or a points-only prop.
 * Same idea as the B3 table guard (`searchAdapter.percentUnits.f4.test.ts`).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..")
const DIRS = ["components/charts/system", "components/dashboard/delivery"]

/** `x > 1 ? x / 100 : x` (points read as a ratio). */
const DIVIDE_GUESS = /[>]=?\s*1(?:\.0+)?\s*\?[^:\n]*\/\s*100\b/
/** `x > 1 ? x : x * 100` (a ratio read as points). */
const MULTIPLY_GUESS = /[>]=?\s*1(?:\.0+)?\s*\?\s*([\w.]+)\s*:\s*\1\s*\*\s*100\b/
/** `x <= 1 ? x * 100 : x` (the same guess the other way round). */
const LOW_GUESS = /<=?\s*1(?:\.0+)?\s*\?\s*([\w.]+)\s*\*\s*100\s*:\s*\1\b/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue
      out.push(...sourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

function guesses(src: string): string[] {
  return src
    .split("\n")
    .filter((line) => DIVIDE_GUESS.test(line) || MULTIPLY_GUESS.test(line) || LOW_GUESS.test(line))
}

test("the guard patterns catch the guesses C-159 removed", () => {
  for (const line of [
    "  percent: (n: number) => fmt.percent(n > 1 ? n / 100 : n),",
    '  if (format === "percent") return fmt.percent(value > 1 ? value / 100 : value)',
    "  const pct = value > 1 ? value : value * 100;",
    "  value: s.value > 1 ? s.value : s.value * 100,",
    "  const r = x >= 1 ? x / 100 : x",
    "  const p = n <= 1 ? n * 100 : n",
  ]) {
    assert.equal(guesses(line).length, 1, line)
  }
  for (const line of [
    "  percent: (n: number) => fmt.percent(n),",
    "  percentPoints: (n: number) => fmt.percentPoints(n),",
    '  conversionCells.length > 1 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1",',
    "  const ratio = safeDiv(videoCompletes, impressions)",
  ]) {
    assert.equal(guesses(line).length, 0, line)
  }
})

test("no chart or delivery file guesses the percent unit from the number's size", () => {
  const files = DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))
  assert.ok(files.length > 20, `scanned ${files.length} files`)
  const found: string[] = []
  for (const file of files) {
    for (const line of guesses(readFileSync(file, "utf8"))) {
      found.push(`${relative(ROOT, file)}: ${line.trim()}`)
    }
  }
  assert.deepEqual(found, [])
})

test("the delivery adapter sends completion as a ratio", () => {
  const src = readFileSync(join(ROOT, "components/dashboard/delivery/channels/directDigitalAdapterShared.ts"), "utf8")
  assert.doesNotMatch(src, /completionRatePct/)
  assert.doesNotMatch(src, /function fmtPct\b/)
  assert.match(src, /completionRateRatio/)
})

test("the web report CTR bubble names its unit", () => {
  const src = readFileSync(join(ROOT, "components/dashboard/web/displays/ElementDisplay.tsx"), "utf8")
  assert.match(src, /yFormat="percentPoints"/)
  assert.doesNotMatch(src, /Format="percent"/)
})
