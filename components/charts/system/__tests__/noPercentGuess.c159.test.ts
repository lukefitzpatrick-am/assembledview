import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

/**
 * C-159: charts never guess a percent unit from the number's size. `percent`
 * is a ratio (1 = 100%); points are `percentPoints` or a points-only prop.
 * Same idea as the B3 table guard (`searchAdapter.percentUnits.f4.test.ts`).
 *
 * B26 (B25 review I-2): scans `lib`, `app` and `components/dashboard/web` as
 * well, so a guess in `lib/chart-theme.ts`, `lib/webReport` or a page is
 * caught.
 *
 * B27 (B26 review L-3): comments are stripped before matching, instead of
 * skipping lines that start like a comment. Comments don't run, and
 * `lib/kpi/percentUnits.ts` names the banned pattern in its doc comment. Code
 * on a line that starts with `/* ... *\/`, code after a closing `*\/` and a
 * wrapped line that starts with the `*` operator are scanned. Strings,
 * template literals and regex literals are kept, so a `//` in a URL does not
 * hide the code after it. Line numbers are kept for the report.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..")
const DIRS = [
  "components/charts/system",
  "components/dashboard/delivery",
  "components/dashboard/web",
  "lib",
  "app",
]

/** `x > 1 ? x / 100 : x` (points read as a ratio). */
const DIVIDE_GUESS = /[>]=?\s*1(?:\.0+)?\s*\?[^:\n]*\/\s*100\b/
/** `x > 1 ? x : x * 100` (a ratio read as points). */
const MULTIPLY_GUESS = /[>]=?\s*1(?:\.0+)?\s*\?\s*([\w.]+)\s*:\s*\1\s*\*\s*100\b/
/** `x <= 1 ? x * 100 : x` (the same guess the other way round). */
const LOW_GUESS = /<=?\s*1(?:\.0+)?\s*\?\s*([\w.]+)\s*\*\s*100\s*:\s*\1\b/
/** After one of these, a `/` starts a regex literal, not a division. */
const REGEX_AFTER_CHAR = new Set([..."(,=:[!&|?{};+-*%~^"])
const REGEX_AFTER_WORD = /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/

/**
 * Blanks every comment (`//` to the end of the line, and `/* ... *\/`) with
 * spaces, keeping newlines, so line numbers stay the same. Strings, template
 * literals (with `${}` nesting) and regex literals are copied as they are, and
 * comment markers inside them are not comments.
 */
export function stripComments(src: string): string {
  let out = ""
  let i = 0
  /** Open `{` count inside each `${` of the template literals we are in. */
  const templates: number[] = []
  /** Last code character that is not white space, to tell a regex from a division. */
  let prev = ""
  const blank = (text: string) => text.replace(/[^\n]/g, " ")

  /** Copies template text from `i` up to the closing backtick or a `${`. */
  function templateText() {
    while (i < src.length) {
      const c = src[i]
      if (c === "\\") {
        out += src.slice(i, i + 2)
        i += 2
      } else if (c === "`") {
        out += c
        i++
        prev = c
        return
      } else if (c === "$" && src[i + 1] === "{") {
        out += "${"
        i += 2
        templates.push(0)
        prev = "{"
        return
      } else {
        out += c
        i++
      }
    }
  }

  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i)
      const stop = end === -1 ? src.length : end
      out += blank(src.slice(i, stop))
      i = stop
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2)
      const stop = end === -1 ? src.length : end + 2
      out += blank(src.slice(i, stop))
      i = stop
    } else if (c === '"' || c === "'") {
      // A quoted string ends at its quote or at the end of the line.
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1
      const stop = src[j] === c ? j + 1 : j
      out += src.slice(i, stop)
      i = stop
      prev = c
    } else if (c === "`") {
      out += c
      i++
      templateText()
    } else if (c === "}" && templates.length > 0 && templates[templates.length - 1] === 0) {
      templates.pop()
      out += c
      i++
      templateText()
    } else if (
      c === "/" &&
      (prev === "" || REGEX_AFTER_CHAR.has(prev) || REGEX_AFTER_WORD.test(out.slice(-12).trimEnd()))
    ) {
      // A regex literal ends at its unescaped `/` (outside a class) or at the end of the line.
      let j = i + 1
      let inClass = false
      while (j < src.length && src[j] !== "\n") {
        const r = src[j]
        if (r === "\\") j++
        else if (r === "[") inClass = true
        else if (r === "]") inClass = false
        else if (r === "/" && !inClass) break
        j++
      }
      const stop = src[j] === "/" ? j + 1 : j
      out += src.slice(i, stop)
      i = stop
      prev = "/"
    } else {
      if (templates.length > 0) {
        if (c === "{") templates[templates.length - 1]++
        else if (c === "}") templates[templates.length - 1]--
      }
      out += c
      i++
      if (!/\s/.test(c)) prev = c
    }
  }
  return out
}

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

/** Guess lines in `src`, comments stripped: 1-based line number and the original text. */
function guesses(src: string): { line: number; text: string }[] {
  const original = src.split("\n")
  const found: { line: number; text: string }[] = []
  stripComments(src)
    .split("\n")
    .forEach((code, index) => {
      if (DIVIDE_GUESS.test(code) || MULTIPLY_GUESS.test(code) || LOW_GUESS.test(code)) {
        found.push({ line: index + 1, text: original[index] ?? "" })
      }
    })
  return found
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
    "  // was: fmt.percent(n > 1 ? n / 100 : n)",
    "  /* was: fmt.percent(n > 1 ? n / 100 : n) */",
  ]) {
    assert.equal(guesses(line).length, 0, line)
  }
})

test("comments are stripped, not skipped: code beside or after a comment is scanned (B26 review L-3)", () => {
  const caught: [string, string, number][] = [
    ["code after a comment on the same line", "/* note */ export const f = (n: number) => (n > 1 ? n / 100 : n)", 1],
    ["a wrapped line that starts with the * operator", "const r = scale\n  * (n > 1 ? n / 100 : n)\n", 2],
    ["code after a closing */", "/**\n * Doc.\n */ export const f = (n: number) => (n > 1 ? n / 100 : n)", 3],
    ["code after a block comment over several lines", "/* one\n   two */ const r = x >= 1 ? x / 100 : x", 2],
    ["a trailing // comment", "  const p = n <= 1 ? n * 100 : n // points", 1],
    ["a // in a double-quoted URL", 'const u = "https://example.com/a"; const r = n > 1 ? n / 100 : n', 1],
    ["a // in a single-quoted URL", "const u = 'https://example.com/a'; const r = n > 1 ? n / 100 : n", 1],
    ["a // and /* in a template literal", "const u = `https://x/${a /* b */}/*`; const r = n > 1 ? n / 100 : n", 1],
    ["a /* in a regex literal", "const re = /[/*]/; const r = n > 1 ? n / 100 : n", 1],
    ["a // in a regex literal", "const re = /https?:\\/\\//; const r = n > 1 ? n / 100 : n", 1],
    ["a division before the guess", "const half = total / 2; const r = n > 1 ? n / 100 : n // */", 1],
  ]
  for (const [name, src, line] of caught) {
    assert.deepEqual(
      guesses(src).map((hit) => hit.line),
      [line],
      name,
    )
  }
  const ignored: [string, string][] = [
    ["a JSDoc block", "/**\n * NEVER infer unit (`value >= 1 ? /100`).\n * n > 1 ? n / 100 : n\n */\nexport const f = 1"],
    ["a block comment before code", "/* n > 1 ? n / 100 : n */ export const f = (n: number) => n"],
    ["a line comment after code", "export const f = (n: number) => n // n > 1 ? n / 100 : n"],
    ["a comment after a URL string", 'const u = "https://x"; // n > 1 ? n / 100 : n'],
  ]
  for (const [name, src] of ignored) {
    assert.deepEqual(guesses(src), [], name)
  }
})

test("stripping comments keeps every line and every non-comment character", () => {
  const src = [
    "/**",
    " * Doc with `x > 1 ? x / 100 : x`.",
    " */",
    'const url = "https://example.com/a/*b*/" // trailing',
    "const t = `${a}//${\"}\"}` + 'it\\'s'",
    "const re = /\\/\\*/g, half = a / 2 / b",
    "/* x */ const z = 1",
  ].join("\n")
  const stripped = stripComments(src)
  assert.equal(stripped.length, src.length)
  assert.equal(stripped.split("\n").length, src.split("\n").length)
  const lines = src.split("\n")
  const spaces = (text: string) => " ".repeat(text.length)
  assert.deepEqual(stripped.split("\n"), [
    spaces(lines[0]!),
    spaces(lines[1]!),
    spaces(lines[2]!),
    'const url = "https://example.com/a/*b*/"' + spaces(" // trailing"),
    "const t = `${a}//${\"}\"}` + 'it\\'s'",
    "const re = /\\/\\*/g, half = a / 2 / b",
    "        const z = 1",
  ])
})

test("no chart, delivery, web report, lib or app file guesses the percent unit from the number's size", () => {
  for (const dir of DIRS) {
    assert.ok(sourceFiles(join(ROOT, dir)).length > 5, `scanned ${dir}`)
  }
  const files = DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))
  assert.ok(files.length > 1000, `scanned ${files.length} files`)
  const found: string[] = []
  for (const file of files) {
    for (const hit of guesses(readFileSync(file, "utf8"))) {
      found.push(`${relative(ROOT, file)}:${hit.line}: ${hit.text.trim()}`)
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
