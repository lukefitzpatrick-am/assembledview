/** Self-test for scripts/run-tests.mjs and scripts/test-files.mjs (B47, C-179). */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { after } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { selectTests } from "../run-tests.mjs"
import { findTests, runnerOf } from "../test-files.mjs"

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const RUNNER = pathToFileURL(path.join(REPO, "scripts/run-tests.mjs")).href
const PASS = `import test, { after } from "node:test"\ntest("ok", () => {})\n`
const VITEST = (body) => `import { it } from "vitest"\nit("x", () => { ${body} })\n`

const roots = []
after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })))

function tempRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-tests-"))
  roots.push(root)
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), body)
  }
  return root
}

/**
 * Runs main() on `root` in a child process, the way `npm test` does. The
 * driver is a file, not `node -e`: run() starts each test file with the
 * parent's exec flags, and `-e` would rerun the driver in every child.
 */
function runMain(root, prefixes = []) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const driver = path.join(root, "driver.mjs")
  fs.writeFileSync(driver, `const m = await import(${JSON.stringify(RUNNER)})\nprocess.exitCode = await m.main(${JSON.stringify(prefixes)}, ${JSON.stringify(root)})\n`)
  return spawnSync(process.execPath, [driver], { cwd: REPO, env, encoding: "utf8" })
}

test("runnerOf routes a file by the test module it imports", () => {
  assert.equal(runnerOf(`import { it } from "vitest"`), "vitest")
  assert.equal(runnerOf(`import test from 'node:test'`), "node")
  assert.equal(runnerOf(`const { test } = require("node:test")`), "node")
  assert.equal(runnerOf(`export {}`), null)
  assert.equal(runnerOf(`import { it } from "vitest"\nimport test, { after } from "node:test"`), null)
})

test("findTests finds bracket paths and skips node_modules everywhere, build and dot folders at the root only", () => {
  const root = tempRoot({
    "app/[slug]/__tests__/a.route.test.ts": PASS,
    "lib/b.node-test.ts": PASS,
    "lib/c.test.tsx": VITEST(""),
    "lib/coverage/__tests__/e.test.mts": PASS,
    "lib/dist/f.test.mjs": PASS,
    "lib/.hidden/g.test.cjs": `const test = require("node:test")\ntest("ok", () => {})\n`,
    "node_modules/pkg/d.test.ts": PASS,
    "lib/node_modules/pkg/d.test.ts": PASS,
    "coverage/h.test.ts": PASS,
    "dist/h.test.ts": PASS,
    ".next/h.test.ts": PASS,
    ".vercel/h.test.ts": PASS,
    "lib/helper.ts": PASS,
  })
  assert.deepEqual(findTests(root), [
    { file: "app/[slug]/__tests__/a.route.test.ts", runner: "node" },
    { file: "lib/.hidden/g.test.cjs", runner: "node" },
    { file: "lib/b.node-test.ts", runner: "node" },
    { file: "lib/c.test.tsx", runner: "vitest" },
    { file: "lib/coverage/__tests__/e.test.mts", runner: "node" },
    { file: "lib/dist/f.test.mjs", runner: "node" },
  ])
})

test("selectTests takes every file without a prefix, else the files that start with one", () => {
  const tests = [{ file: "lib/a/x.test.ts" }, { file: "lib/ab/y.test.ts" }, { file: "app/z.test.ts" }]
  assert.equal(selectTests(tests, []).length, 3)
  assert.deepEqual(selectTests(tests, ["lib/a/"]).map((t) => t.file), ["lib/a/x.test.ts"])
  assert.deepEqual(selectTests(tests, ["lib/a", "app/"]).map((t) => t.file), ["lib/a/x.test.ts", "lib/ab/y.test.ts", "app/z.test.ts"])
})

test("a node:test file under a bracket path runs its tests", () => {
  const r = runMain(tempRoot({ "app/[slug]/__tests__/a.route.test.ts": PASS }))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /node:test files 1 \(ran 1, skipped 0, todo 0\)/)
})

test("a failing node:test file fails the run", () => {
  const r = runMain(tempRoot({ "lib/a.test.ts": `import test, { after } from "node:test"\ntest("no", () => { throw new Error("x") })\n` }))
  assert.equal(r.status, 1)
  assert.match(r.stdout, /node:test files 1 \(ran 1/)
})

/** A root whose `vitest` import and binary resolve to the repo's install. */
function vitestRoot(files) {
  const root = tempRoot(files)
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(root, "node_modules"), "junction")
  return root
}

test("a Vitest file runs, and a failing one fails the run", () => {
  const pass = runMain(vitestRoot({ "lib/a.test.ts": VITEST("") }))
  assert.equal(pass.status, 0, pass.stdout + pass.stderr)
  assert.match(pass.stdout, /vitest files 1/)
  const fail = runMain(vitestRoot({ "lib/a.test.ts": VITEST(`throw new Error("x")`) }))
  assert.equal(fail.status, 1)
  assert.match(fail.stdout, /vitest files 1/)
})

test("a node:test file with no test fails the run, an all-skipped one does not", () => {
  const empty = runMain(tempRoot({ "lib/a.test.ts": `import test, { after } from "node:test"\n` }))
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /lib\/a\.test\.ts: no test ran, skipped or todo/)
  const skipped = runMain(tempRoot({ "lib/a.test.ts": `import test, { after } from "node:test"\ntest("db", { skip: "no database" }, () => {})\n` }))
  assert.equal(skipped.status, 0, skipped.stderr)
  assert.match(skipped.stdout, /ran 0, skipped 1/)
  const suite = runMain(tempRoot({ "lib/a.test.ts": `import { describe, it } from "node:test"\ndescribe("db", { skip: true }, () => { it("x", () => {}) })\n` }))
  assert.equal(suite.status, 0, suite.stderr)
  assert.match(suite.stdout, /ran 0, skipped 1/)
})

test("a test file no runner takes fails the run by name", () => {
  const r = runMain(tempRoot({ "lib/a.test.ts": PASS, "lib/b.test.ts": `export {}\n`, "lib/c.test.js": PASS, "lib/d.test.jsx": PASS, "lib/e.spec.ts": PASS }))
  assert.equal(r.status, 1)
  for (const f of ["b.test.ts", "c.test.js", "d.test.jsx", "e.spec.ts"]) assert.ok(r.stderr.includes(`lib/${f}: no runner takes it`), r.stderr)
})

test("a root with no test file fails the run", () => {
  const r = runMain(tempRoot({ "lib/helper.ts": PASS }))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /found no test files/)
})

test("the CLI runs main", () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts/run-tests.mjs"), "no/such/prefix/"], { cwd: REPO, env, encoding: "utf8" })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no test file starts with no\/such\/prefix\//)
})

test("a prefix that selects nothing fails the run", () => {
  const r = runMain(tempRoot({ "lib/a.test.ts": PASS }), ["app/"])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no test file starts with app\//)
})

// RUNFIX: a file whose results do not add up fails the run, by name and with its counts.
const NODE_TEST = `import test from "node:test"\n`

test("a file that crashes after its first test fails the run", () => {
  const r = runMain(tempRoot({ "lib/a.test.ts": NODE_TEST + `test("first", () => {})\ntest("second", () => { process.kill(process.pid, "SIGKILL") })\n` }))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /lib\/a\.test\.ts: killed by SIGKILL \(started \d+, results \d+, summary none\)/)
})

test("a file that exits 0 before its summary fails the run", () => {
  const body = `test("first", () => {})\ntest("second", async () => { await new Promise((r) => setTimeout(r, 50)); process.exit(0) })\ntest("third", () => {})\n`
  const r = runMain(tempRoot({ "lib/a.test.ts": NODE_TEST + body }))
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /lib\/a\.test\.ts: exited without its summary \(started 3, results 1, summary none\)/)
})

test("a file that reports fewer results than tests it started fails the run, even with its summary", () => {
  // The child writes one more test:enqueue in node:test's own framing (header, size, v8 payload): a start whose result never arrives.
  const ghost = `import v8 from "node:v8"\nconst msg = v8.serialize({ type: "test:enqueue", data: { file: __filename, name: "ghost", nesting: 0 } })\nconst size = Buffer.alloc(4)\nsize.writeUInt32BE(msg.length)\nprocess.stdout.write(Buffer.concat([msg.subarray(0, 2), size, msg]))\n`
  const r = runMain(tempRoot({ "lib/a.test.ts": NODE_TEST + ghost + `test("real", () => {})\n` }))
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /lib\/a\.test\.ts: fewer results than tests started \(started 2, results 1, summary 1\)/)
})

test("a test registered after a top-level await runs, so its late failure fails the run", () => {
  const body = `test("early", () => {})\nawait new Promise((r) => setTimeout(r, 50))\ntest("late", () => { throw new Error("late") })\n`
  const r = runMain(tempRoot({ "lib/a.test.mts": NODE_TEST + body })) // .mts: top-level await needs ESM
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stdout, /node:test files 1 \(ran 2, skipped 0, todo 0\)/)
})
