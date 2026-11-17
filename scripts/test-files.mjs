/**
 * Test file discovery, shared by `scripts/run-tests.mjs` and `vitest.config.ts`
 * (B47, S29 A). Files are found by glob and routed by the runner they import.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const PATTERNS = ["**/*.test.{ts,tsx,mts,mjs,cjs}", "**/*.node-test.ts"]
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "coverage", "dist"])

// Import statements only (anchored at a line start), so a test that holds these words in a string is not misread.
const IMPORTS_VITEST = /^import\s[^"';]*?from\s*["']vitest["']/m
const IMPORTS_NODE_TEST = /^import\s[^"';]*?from\s*["']node:test["']|^(?:const|let|var)\s[^"';]*?require\(\s*["']node:test["']\s*\)/m

/** Which runner a test file belongs to, from its source: "vitest", "node", or null (neither or both). */
export function runnerOf(source) {
  const v = IMPORTS_VITEST.test(source)
  const n = IMPORTS_NODE_TEST.test(source)
  return v === n ? null : v ? "vitest" : "node"
}

/** Every test file under `root`, repo-relative with forward slashes, sorted, with its runner. */
export function findTests(root = ROOT) {
  const files = fs.globSync(PATTERNS, {
    cwd: root,
    exclude: (p) => SKIP_DIRS.has(path.basename(p)),
  })
  return [...new Set(files.map((f) => f.split(path.sep).join("/")))]
    .sort()
    .map((file) => ({ file, runner: runnerOf(fs.readFileSync(path.join(root, file), "utf8")) }))
}

