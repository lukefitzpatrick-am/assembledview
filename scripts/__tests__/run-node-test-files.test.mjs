/** Self-test for scripts/run-node-test-files.mjs (C-179): bracket paths run their tests. */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { escapeTestGlob, testPattern } from "../run-node-test-files.mjs"

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../run-node-test-files.mjs")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

test("escapeTestGlob puts each glob character in a class of its own", () => {
  assert.equal(
    escapeTestGlob("app/api/dashboard/[slug]/[mba_number]/creative/__tests__/creative.route.test.ts"),
    "app/api/dashboard/[[]slug[]]/[[]mba_number[]]/creative/__tests__/creative.route.test.ts",
  )
  assert.equal(escapeTestGlob("app/[...path]/a*b?.test.ts"), "app/[[]...path[]]/a[*]b[?].test.ts")
  assert.equal(escapeTestGlob("lib/{a,b}/x.test.ts"), "lib/[{]a,b[}]/x.test.ts")
  assert.equal(escapeTestGlob("lib\\clients\\x.test.ts"), "lib/clients/x.test.ts")
  assert.equal(escapeTestGlob("lib/clients/__tests__/x.test.ts"), "lib/clients/__tests__/x.test.ts")
})

test("testPattern is relative to the repo root inside it, and refuses a missing file", () => {
  const file = "app/api/mediaplans/[id]/download/__tests__/download.route.test.ts"
  assert.equal(
    testPattern(file, { root, cwd: root }),
    "app/api/mediaplans/[[]id[]]/download/__tests__/download.route.test.ts",
  )
  assert.throws(() => testPattern("app/api/mediaplans/[id]/nope.test.ts", { root, cwd: root }), /no such file/)
})

const tempDirs = []
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
})

function bracketDir(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-node-test-files-"))
  tempDirs.push(dir)
  fs.mkdirSync(path.join(dir, "[id]"))
  const file = path.join(dir, "[id]", "probe.test.mjs")
  fs.writeFileSync(file, body)
  return file
}
/** Runs the script as a fresh process: without NODE_TEST_CONTEXT, which makes a child `--test` report to this run. */
function run(...args) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [script, "--test-reporter=tap", ...args], { cwd: root, encoding: "utf8", env })
}

test("a file under an [id] folder runs its tests (plain node --test runs 0)", () => {
  const file = bracketDir('import test from "node:test"\ntest("one", () => {})\ntest("two", () => {})\n')
  const r = run(file)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^# tests 2$/m)
  assert.match(r.stdout, /^# pass 2$/m)
})

test("a failing test under an [id] folder fails the run", () => {
  const file = bracketDir('import assert from "node:assert"\nimport test from "node:test"\ntest("bad", () => assert.equal(1, 2))\n')
  const r = run(file)
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /^# fail 1$/m)
})

test("a missing file or no file fails the run", () => {
  assert.equal(run(path.join(os.tmpdir(), "[id]", "missing.test.mjs")).status, 1)
  assert.equal(run().status, 1)
})
