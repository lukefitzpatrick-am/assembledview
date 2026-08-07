/**
 * Coverage readings for dirty-state controller + adapters.
 *
 * Uses Node's `--experimental-test-coverage` for node:test suites and
 * Vitest `--coverage` (v8) for React adapter suites. Does NOT enforce
 * thresholds — exit non-zero only if a suite fails, never for low %.
 *
 * Focus files (reported in the summary):
 *   - lib/mediaplan/mediaPlanDirtyController.ts
 *   - lib/mediaplan/useMediaPlanDirtyController.ts
 *   - components/mediaplans/ExpertApplyDirtyClearOnSave.tsx
 */
import { spawnSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const FOCUS = [
  "lib/mediaplan/mediaPlanDirtyController.ts",
  "lib/mediaplan/useMediaPlanDirtyController.ts",
  "components/mediaplans/ExpertApplyDirtyClearOnSave.tsx",
]

const nodeArgs = [
  "--import",
  "./scripts/test-shims/register-server-only.mjs",
  "--require",
  "./scripts/test-shims/mock-server-only.cjs",
  "--import",
  "tsx",
  "--experimental-test-coverage",
  "--test-coverage-include=lib/mediaplan/mediaPlanDirtyController.ts",
  "--test",
  "lib/mediaplan/__tests__/mediaPlanDirtyController.test.ts",
  "lib/mediaplan/__tests__/hasUnsavedChanges.characterisation.test.ts",
]

console.log("\n======== node:test coverage (mediaPlanDirtyController) ========")
const nodeRun = spawnSync(process.execPath, nodeArgs, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: false,
})

console.log("\n======== vitest coverage (adapters + ExpertApply) ========")
const vitestRun = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "--coverage",
    "lib/mediaplan/__tests__/useMediaPlanDirtyController.test.tsx",
    "components/mediaplans/__tests__/ExpertApplyDirtyClearOnSave.characterisation.test.tsx",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  }
)

/** @type {Record<string, { lines?: { pct: number }; statements?: { pct: number }; functions?: { pct: number }; branches?: { pct: number } }>} */
let vitestByFile = {}
const summaryPath = join(root, "coverage", "dirty", "coverage-summary.json")
if (existsSync(summaryPath)) {
  try {
    const raw = JSON.parse(readFileSync(summaryPath, "utf8"))
    for (const [abs, metrics] of Object.entries(raw)) {
      if (abs === "total") continue
      const norm = String(abs).replace(/\\/g, "/")
      const rel =
        FOCUS.find((f) => norm.endsWith(f)) ??
        (norm.includes("lib/mediaplan/") || norm.includes("components/mediaplans/")
          ? norm.split(/avmediaplan\//).pop() ?? norm
          : null)
      if (rel) vitestByFile[rel] = metrics
    }
  } catch (err) {
    console.warn("[test:coverage] could not parse vitest json-summary:", err)
  }
}

console.log("\n======== test:coverage readings (instrumented) ========")
console.log("Node suite → mediaPlanDirtyController.ts (see table above).")
console.log("Vitest suite (v8) per focus file:")
if (Object.keys(vitestByFile).length === 0) {
  console.log("  (no json-summary parsed — see vitest text table above)")
} else {
  for (const f of FOCUS) {
    const m = vitestByFile[f] ?? vitestByFile[Object.keys(vitestByFile).find((k) => k.endsWith(f)) ?? ""]
    if (!m) {
      console.log(`  ${f}: not in report (not loaded by this vitest run)`)
      continue
    }
    const line = m.lines?.pct
    const stmt = m.statements?.pct
    const fn = m.functions?.pct
    const br = m.branches?.pct
    console.log(
      `  ${f}: lines ${line ?? "?"}%, stmts ${stmt ?? "?"}%, funcs ${fn ?? "?"}%, branches ${br ?? "?"}%`
    )
  }
}
console.log(
  "\nNo thresholds — never fails on coverage %. Suite failure is the only non-zero exit."
)
console.log(
  "Page create/edit adapters are source-contract tested, not V8-executed here."
)

const failed =
  (typeof nodeRun.status === "number" ? nodeRun.status : 1) !== 0 ||
  (typeof vitestRun.status === "number" ? vitestRun.status : 1) !== 0

process.exit(failed ? 1 : 0)
