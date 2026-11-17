/** Self-test for scripts/check-date-boundaries.mjs (B49, S30). */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { countDateBoundaries } from "../check-date-boundaries.mjs"

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../check-date-boundaries.mjs")

test("each shape counts once: zone literals, UTC calendar keys, hand-built midnights, formatToParts", () => {
  assert.equal(countDateBoundaries(`const z = "Australia/Melbourne"`, "a.ts"), 1)
  assert.equal(countDateBoundaries(`fmt({ timeZone: 'Australia/Sydney' })`, "a.ts"), 1)
  assert.equal(countDateBoundaries(`const m = new Date().toISOString().slice(0, 7)`, "a.ts"), 1)
  assert.equal(countDateBoundaries(`const d = x.toISOString().slice(0,10)`, "a.ts"), 1)
  assert.equal(countDateBoundaries("const t = new Date(`${ymd}T00:00:00Z`)", "a.ts"), 1)
  assert.equal(countDateBoundaries(`const p = f.formatToParts(now)`, "a.ts"), 1)
  assert.equal(countDateBoundaries(`sql\`(now() AT TIME ZONE 'Australia/Melbourne')::date\``, "a.ts"), 1, "SQL text in code counts")
})

test("comments do not count; other slices and times do", () => {
  assert.equal(countDateBoundaries(`// Australia/Sydney toISOString().slice(0, 10)\n/** T00:00:00 formatToParts */\nconst a = 1`, "a.ts"), 0)
  assert.equal(countDateBoundaries(`const s = d.toISOString().slice(0, 16)`, "a.ts"), 0)
  assert.equal(countDateBoundaries(`const t = "T12:00:00"`, "a.ts"), 0)
  assert.equal(countDateBoundaries(`export const C = () => <p>{/* Australia/Sydney */}{x}</p>`, "a.tsx"), 0)
})

function tree(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "date-boundaries-"))
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true })
  if (baseline) fs.writeFileSync(path.join(root, "scripts", "date-boundaries-baseline.json"), JSON.stringify(baseline))
  return root
}

const run = (root, ...args) => spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" })

test("growth and a new file fail; lib/dates and tests are not scanned; a drop passes and --update lowers", () => {
  const files = {
    "lib/a.ts": `const z = "Australia/Sydney"\nconst k = d.toISOString().slice(0, 7)`,
    "lib/dates/melbourne.ts": `const z = "Australia/Melbourne"`,
    "lib/__tests__/a.test.ts": `const z = "Australia/Melbourne"`,
    "components/b.test.tsx": `const z = "Australia/Melbourne"`,
  }
  assert.equal(run(tree(files, { "lib/a.ts": 2 })).status, 0)
  assert.equal(run(tree(files, { "lib/a.ts": 1 })).status, 1, "lib/a.ts grew")
  assert.equal(run(tree({ ...files, "app/new.ts": "x.formatToParts(d)" }, { "lib/a.ts": 2 })).status, 1, "new file")
  const root = tree({ "lib/a.ts": `const z = "Australia/Sydney"` }, { "lib/a.ts": 2, "lib/gone.ts": 3 })
  assert.equal(run(root).status, 0)
  assert.equal(run(root, "--update").status, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "scripts", "date-boundaries-baseline.json"), "utf8")), { "lib/a.ts": 1 })
  assert.equal(run(tree(files)).status, 1, "baseline missing")
})
