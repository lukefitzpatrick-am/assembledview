import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import ts from "typescript"

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
 *
 * B28 (B27 review L-2 to L-4): the TypeScript parser finds the comments (see
 * `stripComments`). The repo scan only parses files that hold both `100`
 * and `?`, the characters every guess pattern needs.
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
/**
 * Blanks every comment (`//` to the end of the line, and `/* ... *\/`, JSDoc
 * included) with spaces, keeping newlines, so line numbers stay the same.
 *
 * B28 (B27 review L-2 to L-4): the TypeScript parser decides what is code,
 * not a hand-written scanner. So a regex after `=>`, `<`, `>` or `return`, a
 * `//` or `/*` in JSX text, and a division after `i++` are all read the way
 * the compiler reads them. `fileName` picks TS or TSX parsing.
 *
 * How: walk the syntax tree. A token node (an identifier, a string, a regex,
 * a template part, JSX text) is copied as it is. Between and around the child
 * nodes of any other node there is only punctuation, keywords and trivia, and
 * no literal, so the plain scanner reads that text exactly and its comment
 * tokens are blanked. That includes an empty `catch {}` body.
 */
export function stripComments(src: string, fileName = "probe.ts"): string {
  const tsx = fileName.endsWith(".tsx")
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, false, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, tsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard)
  const out = src.split("")
  function blankCommentsIn(start: number, end: number) {
    if (end <= start) return
    scanner.setText(src, start, end - start)
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
      if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        for (let i = scanner.getTokenStart(); i < scanner.getTokenEnd(); i++) if (out[i] !== "\n") out[i] = " "
      }
    }
  }
  function visit(node: ts.Node) {
    if (ts.isToken(node)) {
      // Only the trivia before the token can hold a comment.
      blankCommentsIn(node.pos, node.getStart(sf))
      return
    }
    let cursor = node.pos
    ts.forEachChild(node, (child) => {
      blankCommentsIn(cursor, child.pos)
      visit(child)
      cursor = child.end
    })
    blankCommentsIn(cursor, node.end)
  }
  visit(sf)
  return out.join("")
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
function guesses(src: string, fileName = "probe.ts"): { line: number; text: string }[] {
  const original = src.split("\n")
  const found: { line: number; text: string }[] = []
  stripComments(src, fileName)
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

test("the parser reads regex, JSX text and division the way the compiler does (B27 review L-2 to L-4)", () => {
  const guess = "const r = n > 1 ? n / 100 : n"
  const caught: [string, string, number, string?][] = [
    ["a regex holding /* after =>", `const t = (s: string) => /[/*]/.test(s)\n${guess}\n// */`, 2],
    ["a regex holding // after =>", `const t = (s: string) => /\\/\\//.test(s); ${guess}`, 1],
    ["a regex after <", `const a = b < /[/*]/.source.length\n${guess}\n// */`, 2],
    ["a regex after >", `const a = b > /[/*]/.source.length\n${guess}\n// */`, 2],
    ["a regex after return and many spaces", `function f(s: string) {\n  return          /[/*]/.test(s)\n}\n${guess}\n// */`, 4],
    ["a regex after return", `function f(s: string) {\n  return /[/*]/.test(s)\n}\n${guess}\n// */`, 4],
    ["a regex class holding */ then //", `const re = /[*/]/; ${guess} // x`, 1],
    ["an object literal inside a template ${}", `const t = \`\${ {a: "}"}.a }//\`; ${guess}`, 1],
    ["an unterminated string ends at its line", `const s = "abc\n${guess}`, 2],
    ["// in JSX text", "const el = <p>see http://x {n > 1 ? n / 100 : n}</p>", 1, "probe.tsx"],
    ["/* in JSX text", `const el = <p>use /* here</p>\n${guess}\n// */`, 2, "probe.tsx"],
  ]
  for (const [name, src, line, fileName] of caught) {
    assert.deepEqual(
      guesses(src, fileName).map((hit) => hit.line),
      [line],
      name,
    )
  }
  const ignored: [string, string, string?][] = [
    ["a division after i++, then a comment", "const x = i++ / 2 // n > 1 ? n / 100 : n"],
    ["a comment in an empty catch block", "try {\n  f()\n} catch {\n  // n > 1 ? n / 100 : n\n}"],
    ["a comment in an empty object literal", "const o = { /* n > 1 ? n / 100 : n */ }"],
    ["a JSX comment", "const el = <p>{/* n > 1 ? n / 100 : n */}</p>", "probe.tsx"],
    // In a .ts file `<number>x` is a type assertion, not JSX, so this is a comment.
    ["a comment after a type assertion in a .ts file", "const v = <number>x // n > 1 ? n / 100 : n", "probe.ts"],
  ]
  for (const [name, src, fileName] of ignored) {
    assert.deepEqual(guesses(src, fileName), [], name)
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

/** Guess hits in `files` as `file:line: text`, and how many files were parsed. */
function scanFiles(files: string[]): { found: string[]; parsed: number } {
  const found: string[] = []
  let parsed = 0
  for (const file of files) {
    const src = readFileSync(file, "utf8")
    // Every guess pattern needs `100` and `?`, and stripping only blanks text, so a
    // file without both cannot hold a guess. Saves parsing about 1,700 of the files.
    if (!src.includes("100") || !src.includes("?")) continue
    parsed++
    for (const hit of guesses(src, file)) {
      found.push(`${relative(ROOT, file)}:${hit.line}: ${hit.text.trim()}`)
    }
  }
  return { found, parsed }
}

test("the repo scan parses each file as TS or TSX by its name", () => {
  const dir = mkdtempSync(join(tmpdir(), "no-percent-guess-"))
  try {
    const tsx = join(dir, "Probe.tsx")
    const tsFile = join(dir, "probe.ts")
    const none = join(dir, "none.ts")
    writeFileSync(tsx, "export const P = ({ n }: { n: number }) => <p>see http://x/a {n > 1 ? n / 100 : n}</p>\n")
    writeFileSync(tsFile, "export const v = <number>x // n > 1 ? n / 100 : n\n")
    writeFileSync(none, "export const v = 1\n")
    const { found, parsed } = scanFiles([tsx, tsFile, none])
    assert.equal(parsed, 2)
    assert.equal(found.length, 1, found.join("\n"))
    assert.match(found[0]!, /Probe\.tsx:1: export const P = /)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("no chart, delivery, web report, lib or app file guesses the percent unit from the number's size", () => {
  for (const dir of DIRS) {
    assert.ok(sourceFiles(join(ROOT, dir)).length > 5, `scanned ${dir}`)
  }
  const files = DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))
  assert.ok(files.length > 1000, `scanned ${files.length} files`)
  const { found, parsed } = scanFiles(files)
  assert.ok(parsed > 100, `parsed ${parsed} files`)
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
