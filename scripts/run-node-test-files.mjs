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
 * usage: node scripts/run-node-test-files.mjs [--node-flag ...] <file> [<file> ...]
 *
 * Arguments that start with `--` go to node before `--test` (for example
 * `--test-reporter=tap`). Exit 1 when a file is missing, a pattern does not
 * match exactly its file, or a test fails.
 */
import { spawnSync } from "node:child_process"
import fs, { existsSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const SHIMS = [
  "--experimental-test-module-mocks",
  "--import",
  "./scripts/test-shims/register-server-only.mjs",
  "--require",
  "./scripts/test-shims/mock-server-only.cjs",
  "--import",
  "tsx",
]

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
  if (matches.length === 1 && matches[0] === path.resolve(full)) return
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
  const full = path.resolve(cwd, file)
  if (!existsSync(full) || !statSync(full).isFile()) {
    throw new Error(`[run-node-test-files] no such file: ${file}`)
  }
  const rel = path.relative(root, full)
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
      assertPatternMatchesOnly(pattern, path.resolve(f))
      return pattern
    })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }
  const r = spawnSync(process.execPath, [...SHIMS, ...flags, "--test", ...patterns], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  })
  return typeof r.status === "number" ? r.status : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)))
}
