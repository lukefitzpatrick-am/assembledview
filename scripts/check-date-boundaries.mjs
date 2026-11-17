#!/usr/bin/env node
/**
 * Date boundary ratchet (B49, S30). `lib/dates` is the only code that gives
 * a `Date` calendar meaning. Outside it, in .ts and .tsx files under app/,
 * lib/, components/, hooks/, contexts/ and middleware.ts (tests excluded),
 * this counts per file:
 *   - zone literals `Australia/Melbourne` and `Australia/Sydney`
 *     (use `BUSINESS_TZ` or a `lib/dates` function);
 *   - `toISOString().slice(0, 7)` and `toISOString().slice(0, 10)` (or
 *     `substring`), a UTC calendar key (use `getMelbourneTodayISO`,
 *     `toMelbourneDateString`);
 *   - the host month or day of now: `format(new Date(), "yyyy-MM...")` and
 *     `new Date().getFullYear()`, `getMonth()`, `getDate()` (and UTC forms)
 *     (use `getMelbourneMonthISO`, `getMelbourneTodayISO`; S9 A, RELFIX1);
 *   - hand-built `T00:00:00` strings (use `lib/dates/civil`);
 *   - `formatToParts` (use `melbourneParts`).
 * Comments are not counted. A file fails when its count rises or a new file
 * appears; a drop passes. The baseline only goes down:
 *   --update   lowers each file to its current count and drops files at 0.
 *   --reseed   writes the current counts. Only for the commit that changes
 *              what is counted.
 * `--root <dir>` scans another tree (the self-test uses it).
 * Shortcut: a text count, so a key built another way is missed; move it
 * behind `lib/dates` when review finds one. A new pattern needs a decision
 * (the now-month shapes are S9 A) and a --reseed in the same commit.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import ts from "typescript"

const SCAN_DIRS = ["app", "lib", "components", "hooks", "contexts"]
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "__tests__"])

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(entry.name)) out.push(full)
  }
  return out
}

const PATTERNS = [
  /Australia\/(?:Melbourne|Sydney)/g,
  /toISOString\(\)\.(?:slice|substring)\(0,\s*(?:7|10)\)/g,
  /\bformat\(\s*new Date\(\)\s*,\s*["'`]yyyy-MM/g,
  /new Date\(\)\.get(?:UTC)?(?:FullYear|Month|Date)\(/g,
  /T00:00:00/g,
  /\bformatToParts\b/g,
]

/** Source text with every comment blanked (length and newlines kept). */
function stripComments(raw, fileName = "x.tsx") {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, raw, ts.ScriptTarget.Latest, true, kind)
  const ranges = new Map()
  const collect = (pos) => {
    for (const r of [...(ts.getLeadingCommentRanges(raw, pos) ?? []), ...(ts.getTrailingCommentRanges(raw, pos) ?? [])]) ranges.set(r.pos, r.end)
  }
  // Every node and token (getChildren includes tokens), so a comment alone in `{/* */}` is found too.
  const visit = (node) => {
    collect(node.pos)
    collect(node.end)
    for (const child of node.getChildren(sf)) visit(child)
  }
  visit(sf)
  let out = raw
  for (const [start, end] of ranges) out = out.slice(0, start) + out.slice(start, end).replace(/[^\n]/g, " ") + out.slice(end)
  return out
}

export function countDateBoundaries(raw, fileName) {
  const code = stripComments(raw, fileName)
  return PATTERNS.reduce((n, re) => n + (code.match(re)?.length ?? 0), 0)
}

function scanRoot(rootDir) {
  const files = SCAN_DIRS.map((d) => path.join(rootDir, d)).filter((d) => fs.existsSync(d)).flatMap((d) => walk(d, []))
  if (fs.existsSync(path.join(rootDir, "middleware.ts"))) files.push(path.join(rootDir, "middleware.ts"))
  const counts = {}
  for (const file of files) {
    const rel = path.relative(rootDir, file).split(path.sep).join("/")
    if (rel.startsWith("lib/dates/")) continue
    const n = countDateBoundaries(fs.readFileSync(file, "utf8"), rel)
    if (n > 0) counts[rel] = n
  }
  return counts
}

function writeBaseline(file, counts) {
  const ordered = Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]))
  fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`)
}

function main(argv) {
  const at = argv.indexOf("--root")
  const rootDir = at >= 0 && argv[at + 1] ? path.resolve(argv[at + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const baselinePath = path.join(rootDir, "scripts", "date-boundaries-baseline.json")
  const counts = scanRoot(rootDir)
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  if (argv.includes("--reseed")) {
    writeBaseline(baselinePath, counts)
    console.log(`check:date-boundaries: reseeded (${Object.keys(counts).length} files, ${total}).`)
    return 0
  }
  if (!fs.existsSync(baselinePath)) {
    console.error("check:date-boundaries: baseline missing. Run with --reseed once.")
    return 1
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  const failures = Object.entries(counts)
    .filter(([rel, n]) => n > (baseline[rel] ?? 0))
    .map(([rel, n]) => `${rel}: ${n} (baseline ${baseline[rel] ?? 0}${baseline[rel] == null ? ", not in baseline" : ""})`)
  if (failures.length) {
    console.error("Calendar code outside lib/dates went up. Use lib/dates (BUSINESS_TZ, melbourneParts, getMelbourneTodayISO, lib/dates/civil).\n")
    for (const f of failures) console.error(f)
    return 1
  }
  const lowered = {}
  let dropped = 0
  for (const [rel, allowed] of Object.entries(baseline)) {
    const n = Math.min(counts[rel] ?? 0, allowed)
    dropped += allowed - n
    if (n > 0) lowered[rel] = n
  }
  if (argv.includes("--update")) {
    writeBaseline(baselinePath, lowered)
    console.log(`check:date-boundaries: baseline lowered by ${dropped} (${total}).`)
    return 0
  }
  console.log(dropped > 0 ? `check:date-boundaries: ok (${total}, ${dropped} under baseline). --update tightens it.` : `check:date-boundaries: ok (${Object.keys(counts).length} files, ${total})`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)))
}
