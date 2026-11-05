/**
 * Run node:test files by their literal path (C-179).
 *
 * `node --test <path>` reads each path as a glob pattern. A path with `[id]`,
 * `[slug]` or `[mba_number]` then matches nothing: 0 tests run and the exit
 * code is 0, so the file looks green. This runner checks that each file
 * exists, escapes the glob characters (`[` becomes `[[]`), and runs the files
 * with the same shims as the route tests (module mocks, server-only, tsx).
 *
 * usage: node scripts/run-node-test-files.mjs [--node-flag ...] <file> [<file> ...]
 *
 * Arguments that start with `--` go to node before `--test` (for example
 * `--test-reporter=tap`). Exit 1 when a file is missing or a test fails.
 */
import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
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

/** A literal path as a `node --test` pattern: each glob character in a class of its own. */
export function escapeTestGlob(file) {
  return file.replace(/\\/g, "/").replace(/[[\]*?{}]/g, (c) => `[${c}]`)
}

/**
 * The `node --test` pattern for one file: relative to the repo root when the
 * file is inside it, else absolute. Throws when the file does not exist.
 */
export function testPattern(file, { root = ROOT, cwd = process.cwd() } = {}) {
  const full = path.resolve(cwd, file)
  if (!existsSync(full) || !statSync(full).isFile()) {
    throw new Error(`[run-node-test-files] no such file: ${file}`)
  }
  const rel = path.relative(root, full)
  const inside = rel && !rel.startsWith("..") && !path.isAbsolute(rel)
  return escapeTestGlob(inside ? rel : full)
}

function main(argv) {
  const flags = argv.filter((a) => a.startsWith("--"))
  const files = argv.filter((a) => !a.startsWith("--"))
  if (files.length === 0) {
    console.error("[run-node-test-files] usage: node scripts/run-node-test-files.mjs [--node-flag ...] <file> ...")
    return 1
  }
  let patterns
  try {
    patterns = files.map((f) => testPattern(f))
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
