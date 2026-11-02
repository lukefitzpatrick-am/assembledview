#!/usr/bin/env node
/**
 * Per-file `any` ratchet (B7, G3).
 *
 * Counts, in .ts and .tsx files under app/, lib/, components/, src/, hooks/,
 * contexts/ and middleware.ts (tests excluded: __tests__/, *.test.*, *.spec.*):
 *   `: any` (including `: any[]`), `as any`, any other `any[]`, `any` as a
 *   type argument or union member (`Record<string, any>`, `Array<any>`,
 *   `Promise<any>`, `string | any`), `type T = any`, and `@ts-ignore`,
 *   `@ts-expect-error` and `@ts-nocheck` comments (the last four forms and
 *   comments added in the B7 review).
 * Each `any` counts once. Comments and string contents are ignored (except for
 * `@ts-ignore`, which lives in a comment).
 *
 * The baseline is scripts/any-ratchet-baseline.json. A file fails when its
 * count rises or a new file appears. A drop passes. The baseline only goes
 * down:
 *   --update   lowers each file to its current count and drops files at 0;
 *              it never raises a count or adds a file.
 *   --reseed   writes the current counts as they are. Only for the commit
 *              that changes what is counted.
 * Adding an `any` on purpose means editing the JSON by hand, in review.
 * `--root <dir>` scans another tree (the self-test uses it).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { maskNonCode } from "./check-egress-guards.mjs"

export const SCAN_DIRS = ["app", "lib", "components", "src", "hooks", "contexts"]
export const SCAN_FILES = ["middleware.ts"]
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "coverage", "out"])

function posix(rel) {
  return rel.split(path.sep).join("/")
}

function isTestPath(rel) {
  if (rel.includes("/__tests__/")) return true
  return /\.(test|spec)\.tsx?$/.test(rel)
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full)
  }
  return out
}

/** Number of `any` uses and `@ts-ignore` comments in one source file. */
export function countAny(raw) {
  const code = maskNonCode(raw)
  const seen = new Set()
  const res = [
    /:\s*any\b/g,
    /\bas\s+any\b/g,
    /\bany\s*\[\s*\]/g,
    // B7 review: a type argument or union member (`Record<string, any>`,
    // `Array<any>`, `Promise<any>`, `string | any`, `A & any`).
    /[<,|&]\s*any\b/g,
    // B7 review: `type T = any` (and `type T<U> = any`).
    /\btype\s+[A-Za-z_$][\w$]*(?:\s*<[^>=]*>)?\s*=\s*any\b/g,
  ]
  for (const re of res) {
    let m
    while ((m = re.exec(code))) {
      // The `any` token's index, so `: any[]`, `as any[]` and `<any[]>` count once.
      const at = m.index + m[0].lastIndexOf("any")
      seen.add(at)
    }
  }
  const ignores = raw.match(/@ts-(?:ignore|expect-error|nocheck)\b/g)?.length ?? 0
  return seen.size + ignores
}

export function scanRoot(rootDir) {
  const files = []
  for (const dir of SCAN_DIRS) {
    const abs = path.join(rootDir, dir)
    if (fs.existsSync(abs)) walk(abs, files)
  }
  for (const file of SCAN_FILES) {
    const abs = path.join(rootDir, file)
    if (fs.existsSync(abs)) files.push(abs)
  }
  const counts = {}
  for (const file of files) {
    const rel = posix(path.relative(rootDir, file))
    if (isTestPath(rel)) continue
    const n = countAny(fs.readFileSync(file, "utf8"))
    if (n > 0) counts[rel] = n
  }
  return counts
}

function writeBaseline(baselinePath, counts) {
  const ordered = {}
  for (const key of Object.keys(counts).sort()) ordered[key] = counts[key]
  fs.writeFileSync(baselinePath, `${JSON.stringify(ordered, null, 2)}\n`)
}

function main(argv) {
  const at = argv.indexOf("--root")
  const rootDir =
    at >= 0 && argv[at + 1]
      ? path.resolve(argv[at + 1])
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const baselinePath = path.join(rootDir, "scripts", "any-ratchet-baseline.json")
  const counts = scanRoot(rootDir)
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  if (argv.includes("--reseed")) {
    writeBaseline(baselinePath, counts)
    console.log(`check:any-ratchet: reseeded baseline (${Object.keys(counts).length} files, ${total}). Only with a counting change.`)
    return 0
  }

  if (!fs.existsSync(baselinePath)) {
    console.error("check:any-ratchet: baseline missing. Run with --reseed once.")
    return 1
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))

  const failures = []
  for (const [rel, count] of Object.entries(counts)) {
    const allowed = baseline[rel] ?? 0
    if (count > allowed) failures.push(`${rel}: ${count} (baseline ${allowed}${baseline[rel] == null ? ", new file" : ""})`)
  }
  const update = argv.includes("--update")
  if (failures.length) {
    console.error(
      update
        ? "check:any-ratchet: --update only lowers the baseline; these files are over it. Type it instead of `any`.\n"
        : "`any` count went up. Type it instead (unknown plus a narrow, or the real type).\n",
    )
    for (const f of failures) console.error(f)
    return 1
  }

  let dropped = 0
  const lowered = {}
  for (const [rel, allowed] of Object.entries(baseline)) {
    const count = Math.min(counts[rel] ?? 0, allowed)
    dropped += allowed - count
    if (count > 0) lowered[rel] = count
  }
  if (update) {
    writeBaseline(baselinePath, lowered)
    console.log(`check:any-ratchet: baseline lowered by ${dropped} (${total}).`)
    return 0
  }
  console.log(
    dropped > 0
      ? `check:any-ratchet: ok (${total}, ${dropped} under baseline). --update tightens it.`
      : `check:any-ratchet: ok (${Object.keys(counts).length} files, ${total})`,
  )
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)))
}
