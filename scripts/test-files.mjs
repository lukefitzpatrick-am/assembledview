/**
 * Test file discovery, shared by `scripts/run-tests.mjs` and `vitest.config.ts`
 * (B47, S29 A). Files are found by name and routed by the runner they import.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const TEST_NAME = /\.test\.(?:ts|tsx|mts|mjs|cjs)$|\.node-test\.ts$/
// Names that look like tests but no runner takes: found so the run fails on them by name.
const MISNAMED = /\.test\.jsx?$|\.spec\./
// Build output and tool folders, skipped at the repo root only. node_modules is skipped everywhere.
const ROOT_SKIP = new Set(["dist", "coverage"])

// Import statements only (anchored at a line start), so a test that holds these words in a string is not misread.
const IMPORTS_VITEST = /^import\s[^"';]*?from\s*["']vitest["']/m
const IMPORTS_NODE_TEST = /^import\s[^"';]*?from\s*["']node:test["']|^(?:const|let|var)\s[^"';]*?require\(\s*["']node:test["']\s*\)/m

// A test whose subject the browser and the server both reach imports this pin first, so the runner runs it twice (RUNFIX2fix).
const IMPORTS_BOTH_ZONES = /^import\s+["']@\/lib\/testing\/bothZones["']/m

/** Which runner a test file belongs to, from its source: "vitest", "node", or null (neither or both). */
export function runnerOf(source) {
  const v = IMPORTS_VITEST.test(source)
  const n = IMPORTS_NODE_TEST.test(source)
  return v === n ? null : v ? "vitest" : "node"
}

function walk(root, rel, out) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const file = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      const skip = e.name === "node_modules" || (!rel && (ROOT_SKIP.has(e.name) || e.name.startsWith(".")))
      if (!skip) walk(root, file, out)
    } else if (TEST_NAME.test(e.name) || MISNAMED.test(e.name)) out.push(file)
  }
  return out
}

/**
 * Every test file under `root`, repo-relative with forward slashes, sorted, with its runner.
 * A misnamed file (`*.test.js`, `*.test.jsx`, `*.spec.*`) has runner null, so the run fails on it.
 * `bothZones` is true when the file imports `@/lib/testing/bothZones`: it runs in Melbourne, then again in UTC.
 */
export function findTests(root = ROOT) {
  return walk(root, "", [])
    .sort()
    .map((file) => {
      const source = TEST_NAME.test(file) ? fs.readFileSync(path.join(root, file), "utf8") : null
      return { file, runner: source === null ? null : runnerOf(source), bothZones: source !== null && IMPORTS_BOTH_ZONES.test(source) }
    })
}
