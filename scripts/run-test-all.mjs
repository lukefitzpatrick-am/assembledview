/**
 * Run every package.json `test:*` script (except `test:all`) in declaration order.
 * Continues after failures so the full pass/fail table is always printed.
 * Exit 1 if any suite fails.
 *
 * Auto-includes new suites (e.g. `test:codex-flag-auth`) — no hardcoded list.
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const suites = Object.keys(pkg.scripts ?? {}).filter(
  (k) =>
    k.startsWith("test:") && k !== "test:all" && k !== "test:coverage"
)

if (suites.length === 0) {
  console.error("[test:all] no test:* scripts found in package.json")
  process.exit(1)
}

/** @type {{ name: string; ok: boolean; code: number; ms: number }[]} */
const results = []

for (const name of suites) {
  console.log(`\n======== npm run ${name} ========`)
  const started = Date.now()
  const r = spawnSync("npm", ["run", name], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  })
  const code = typeof r.status === "number" ? r.status : 1
  results.push({
    name,
    ok: code === 0,
    code,
    ms: Date.now() - started,
  })
}

console.log("\n======== test:all summary ========")
console.log(
  ["suite".padEnd(36), "result".padEnd(6), "exit", "ms"].join("  ")
)
for (const row of results) {
  console.log(
    [
      row.name.padEnd(36),
      (row.ok ? "PASS" : "FAIL").padEnd(6),
      String(row.code).padStart(4),
      String(row.ms).padStart(8),
    ].join("  ")
  )
}

const failed = results.filter((r) => !r.ok)
console.log(
  `\n${results.length - failed.length}/${results.length} suites passed` +
    (failed.length
      ? ` — FAILED: ${failed.map((f) => f.name).join(", ")}`
      : "")
)

process.exit(failed.length > 0 ? 1 : 0)
