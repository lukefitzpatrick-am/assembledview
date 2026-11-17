/**
 * RUNFIX2fix (RUNFIX2 review R3): the Melbourne pin fails loudly where it
 * cannot change the zone. Node ignores `TZ` set inside a worker thread, which
 * is how Vitest's threads pool runs a file. A one-file Vitest project loads
 * the real pin under each pool.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { after } from "node:test"

const REPO = path.resolve(import.meta.dirname, "../../..")
const root = fs.mkdtempSync(path.join(os.tmpdir(), "melbourne-zone-"))
after(() => fs.rmSync(root, { recursive: true, force: true }))
fs.symlinkSync(path.join(REPO, "node_modules"), path.join(root, "node_modules"), "junction")
fs.writeFileSync(
  path.join(root, "vitest.config.mjs"),
  `export default { resolve: { alias: { "@": ${JSON.stringify(REPO)} } }, test: { include: ["probe.test.ts"] } }\n`,
)
fs.writeFileSync(
  path.join(root, "probe.test.ts"),
  `import "@/lib/testing/melbourneZone"\nimport { expect, it } from "vitest"\nit("zone", () => expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Australia/Melbourne"))\n`,
)

function vitest(pool: string) {
  const bin = path.join(REPO, "node_modules", "vitest", "vitest.mjs")
  return spawnSync(process.execPath, [bin, "run", `--pool=${pool}`], { cwd: root, encoding: "utf8", env: { ...process.env, TZ: "UTC" } })
}

test("the pin moves a forks-pool file to Melbourne", () => {
  const r = vitest("forks")
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test("the pin throws under the threads pool instead of running the file in UTC", () => {
  const r = vitest("threads")
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /the test zone is UTC, not Australia\/Melbourne\. TZ cannot change inside a worker thread/)
})
