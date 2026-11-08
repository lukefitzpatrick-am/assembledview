/**
 * Run node:test files by their literal path (C-179).
 *
 * `node --test <path>` reads each path as a glob pattern. A path with `[id]`,
 * `[slug]` or `[mba_number]` then matches nothing: 0 tests run and the exit
 * code is 0, so the file looks green. This runner checks that each file
 * exists, escapes the glob characters (`[` becomes `[[]`), and runs the files
 * with the same shims as the route tests (module mocks, server-only, tsx).
 *
 * B28 (B27 review M-1): each escaped pattern is checked with `fs.globSync`,
 * the same glob engine `node --test` uses. Unless it matches exactly the one
 * file it was made from, the runner exits 1 before running anything. So a
 * path the escaping gets wrong fails loudly instead of running 0 tests.
 *
 * It also fails a file that runs 0 tests. `scripts/test-shims/count-tests-reporter.mjs`
 * counts the tests that ran in each file (skipped and todo tests, suites, and
 * the placeholder Node reports for an empty file do not count). Your own
 * reporter still prints to stdout; the runner adds a `#` summary line.
 *
 * B28 (B27 review L-1): the route tests skip when `mock.module` is missing,
 * and skipped tests would still exit 0. The runner exits 1 unless the node
 * flags include `--experimental-test-module-mocks` and this Node has
 * `mock.module` with it.
 *
 * usage: node scripts/run-node-test-files.mjs [--node-flag ...] <file> [<file> ...]
 *
 * Arguments that start with `--` go to node before `--test` (for example
 * `--test-reporter=tap`). Exit 1 when a file is missing, a pattern does not
 * match exactly its file, a test fails, or a file runs 0 tests.
 */
import { spawnSync } from "node:child_process"
import fs, { existsSync, statSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * The canonical spelling of a path: symlinks resolved and, on Windows, 8.3
 * short names such as `C:\Users\LUKEFI~1` made long. Node's glob matches long
 * names only, so every path is compared and escaped in this form (B27
 * review, Windows). Falls back to `path.resolve` when the path is missing.
 */
export function realPath(p) {
  const full = path.resolve(p)
  try {
    return fs.realpathSync.native(full)
  } catch {
    return full
  }
}

const SHIMS = [
  "--experimental-test-module-mocks",
  "--import",
  "./scripts/test-shims/register-server-only.mjs",
  "--require",
  "./scripts/test-shims/mock-server-only.cjs",
  "--import",
  "tsx",
]

/** Flags the route tests cannot run without. Kept apart from SHIMS so dropping one there fails the run. */
const REQUIRED_FLAGS = ["--experimental-test-module-mocks"]

/** The REQUIRED_FLAGS missing from the node flags (everything before `--test`). */
export function missingRequiredFlags(args) {
  const end = args.indexOf("--test")
  const nodeFlags = end === -1 ? args : args.slice(0, end)
  return REQUIRED_FLAGS.filter((flag) => !nodeFlags.includes(flag))
}

/**
 * The test module's specifier, built from two parts. A search for files that
 * import it (the batch per-file node suite runs one) then does not take this
 * script for a test file.
 */
const NODE_TEST = ["node", "test"].join(":")

/** True when this Node has `mock.module` under `flags` (the self-test also tries none). */
export function moduleMocksWork(flags = REQUIRED_FLAGS) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const r = spawnSync(
    process.execPath,
    [
      ...flags,
      "--input-type=module",
      "-e",
      `import { mock } from "${NODE_TEST}"; process.exit(typeof mock.module === "function" ? 0 : 3)`,
    ],
    { env, encoding: "utf8" },
  )
  return r.status === 0
}

/** Counts the tests that ran in each file. Relative to the repo root, like the shims. */
const COUNT_REPORTER = "./scripts/test-shims/count-tests-reporter.mjs"

/**
 * The reporter flags: yours (or the default, `spec` on a terminal and `tap`
 * otherwise) to stdout, then the counting reporter to `countsFile`. Node pairs
 * reporters and destinations in order.
 */
export function reporterFlags(flags, countsFile, { tty = Boolean(process.stdout.isTTY) } = {}) {
  const reporters = flags.filter((f) => f.startsWith("--test-reporter="))
  const destinations = flags.filter((f) => f.startsWith("--test-reporter-destination="))
  const out = [...flags]
  if (reporters.length === 0) out.push(`--test-reporter=${tty ? "spec" : "tap"}`, "--test-reporter-destination=stdout")
  else if (destinations.length === 0) out.push(...reporters.map(() => "--test-reporter-destination=stdout"))
  out.push(`--test-reporter=${COUNT_REPORTER}`, `--test-reporter-destination=${countsFile}`)
  return out
}

/**
 * Problems with the per-file counts: a file with no counts row, or with 0
 * tests that ran. `counts` is keyed by absolute path, as Node reports it.
 */
export function zeroTestProblems(fullPaths, counts, { root = ROOT } = {}) {
  const byPath = new Map(Object.entries(counts).map(([file, row]) => [realPath(file), row]))
  const problems = []
  for (const full of fullPaths) {
    const row = byPath.get(realPath(full)) ?? { ran: 0, skipped: 0, todo: 0 }
    if (row.ran > 0) continue
    const rel = path.relative(realPath(root), realPath(full))
    const name = rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : full
    problems.push(`[run-node-test-files] ${name}: 0 tests ran (${row.skipped} skipped, ${row.todo} todo). A file that runs no test fails the run.`)
  }
  return problems
}

/**
 * A literal path as a `node --test` pattern.
 * - `[ ] * ? (` each go in a class of their own (`[` becomes `[[]`). A class
 *   `(` also stops every extglob: `+(b)`, `@(b)`, `!(b)`, `?(b)`, `*(b)`.
 * - Braces: brace expansion runs before classes, so `[{]a,b[}]` still
 *   expands. `{` becomes `[{]` and `}` becomes the range `[|-~]`
 *   (`|`, `}` or `~`), which leaves no `}` in the pattern to expand.
 * - A backslash becomes `/`. Node's glob reads it as a separator, not an escape.
 * `assertPatternMatchesOnly` checks the result against the disk.
 */
export function escapeTestGlob(file) {
  return file
    .replace(/\\/g, "/")
    .replace(/[[\]*?({}]/g, (c) => (c === "{" ? "[{]" : c === "}" ? "[|-~]" : `[${c}]`))
}

/** Files `pattern` matches with Node's own glob (`fs.globSync`), as absolute paths. */
export function globMatches(pattern, { root = ROOT } = {}) {
  if (typeof fs.globSync !== "function") {
    throw new Error(`[run-node-test-files] fs.globSync is missing: Node ${process.versions.node} is too old (needs Node 22)`)
  }
  return fs.globSync(pattern, { cwd: root }).map((match) => path.resolve(root, match))
}

/**
 * Throws unless `pattern` matches exactly `full` and nothing else. Run before
 * `node --test`, which runs 0 tests and exits 0 for a pattern that matches
 * nothing.
 */
export function assertPatternMatchesOnly(pattern, full, { root = ROOT } = {}) {
  const matches = globMatches(pattern, { root })
  if (matches.length === 1 && realPath(matches[0]) === realPath(full)) return
  const found = matches.length === 0 ? "nothing" : matches.map((m) => path.relative(root, m) || m).join(", ")
  throw new Error(
    `[run-node-test-files] the pattern for ${full} does not match exactly that file.\n` +
      `  pattern: ${pattern}\n  matches: ${found}\n` +
      "  The path has a character escapeTestGlob does not handle. Fix escapeTestGlob or rename the folder.",
  )
}

/**
 * The `node --test` pattern for one file: relative to the repo root when the
 * file is inside it, else absolute. Throws when the file does not exist.
 */
export function testPattern(file, { root = ROOT, cwd = process.cwd(), escape = escapeTestGlob } = {}) {
  const given = path.resolve(cwd, file)
  if (!existsSync(given) || !statSync(given).isFile()) {
    throw new Error(`[run-node-test-files] no such file: ${file}`)
  }
  const full = realPath(given)
  const rel = path.relative(realPath(root), full)
  const inside = rel && !rel.startsWith("..") && !path.isAbsolute(rel)
  return escape(inside ? rel : full)
}

/** `escape` is for the self-test: a wrong escape must stop the run. */
export function main(argv, { escape = escapeTestGlob } = {}) {
  const flags = argv.filter((a) => a.startsWith("--"))
  const files = argv.filter((a) => !a.startsWith("--"))
  if (files.length === 0) {
    console.error("[run-node-test-files] usage: node scripts/run-node-test-files.mjs [--node-flag ...] <file> ...")
    return 1
  }
  let patterns
  try {
    patterns = files.map((f) => {
      const pattern = testPattern(f, { escape })
      assertPatternMatchesOnly(pattern, realPath(f))
      return pattern
    })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }
  const missing = missingRequiredFlags(SHIMS)
  if (missing.length > 0) {
    console.error(`[run-node-test-files] missing node flag ${missing.join(", ")}: tests that need module mocks would skip and pass`)
    return 1
  }
  if (!moduleMocksWork()) {
    console.error(`[run-node-test-files] Node ${process.versions.node} has no mock.module under --experimental-test-module-mocks: tests that need it would skip`)
    return 1
  }
  const countsDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-node-test-files-counts-"))
  const countsFile = path.join(countsDir, "counts.json")
  try {
    const r = spawnSync(process.execPath, [...SHIMS, ...reporterFlags(flags, countsFile), "--test", ...patterns], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    })
    const status = typeof r.status === "number" ? r.status : 1
    let counts
    try {
      counts = JSON.parse(fs.readFileSync(countsFile, "utf8"))
    } catch {
      console.error(`[run-node-test-files] no test counts from ${COUNT_REPORTER}, so 0 tests cannot be ruled out`)
      return 1
    }
    const rows = Object.values(counts)
    const total = (key) => rows.reduce((sum, row) => sum + row[key], 0)
    console.log(`# run-node-test-files: files ${files.length}, ran ${total("ran")}, skipped ${total("skipped")}, todo ${total("todo")}`)
    const problems = zeroTestProblems(files.map((f) => realPath(f)), counts)
    for (const problem of problems) console.error(problem)
    return status !== 0 ? status : problems.length > 0 ? 1 : 0
  } finally {
    fs.rmSync(countsDir, { recursive: true, force: true })
  }
}

/**
 * True when node was started with this file. Both sides are real paths (B28
 * review L-1): started through a symlink or a Windows junction, `argv[1]` is
 * the link while `import.meta.url` is the target, and a plain URL compare made
 * the runner do nothing and exit 0.
 */
export function isMainModule(argv1 = process.argv[1], moduleUrl = import.meta.url) {
  if (!argv1) return false
  return realPath(argv1) === realPath(fileURLToPath(moduleUrl))
}

if (isMainModule()) {
  process.exit(main(process.argv.slice(2)))
}
