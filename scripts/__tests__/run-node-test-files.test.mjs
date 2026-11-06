/** Self-test for scripts/run-node-test-files.mjs (C-179): bracket paths run their tests. */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { assertPatternMatchesOnly, escapeTestGlob, main, reporterFlags, testPattern } from "../run-node-test-files.mjs"

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../run-node-test-files.mjs")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

test("escapeTestGlob puts each glob character in a class of its own", () => {
  assert.equal(
    escapeTestGlob("app/api/dashboard/[slug]/[mba_number]/creative/__tests__/creative.route.test.ts"),
    "app/api/dashboard/[[]slug[]]/[[]mba_number[]]/creative/__tests__/creative.route.test.ts",
  )
  assert.equal(escapeTestGlob("app/[...path]/a*b?.test.ts"), "app/[[]...path[]]/a[*]b[?].test.ts")
  assert.equal(escapeTestGlob("lib/{a,b}/x.test.ts"), "lib/[{]a,b[|-~]/x.test.ts")
  assert.equal(escapeTestGlob("app/(group)/a+(b)/x.test.ts"), "app/[(]group)/a+[(]b)/x.test.ts")
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

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-node-test-files-"))
  tempDirs.push(dir)
  return dir
}
/** `probe.test.mjs` under `folder` in a new temp dir, plus a `decoy` test in each of `decoys`. */
function probeIn(folder, body, decoys = []) {
  const dir = tempDir()
  for (const name of decoys) {
    fs.mkdirSync(path.join(dir, name))
    fs.writeFileSync(path.join(dir, name, "probe.test.mjs"), 'import test from "node:test"\ntest("decoy", () => {})\n')
  }
  fs.mkdirSync(path.join(dir, folder))
  const file = path.join(dir, folder, "probe.test.mjs")
  fs.writeFileSync(file, body)
  return file
}
function bracketDir(body) {
  return probeIn("[id]", body)
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

const ONE_TEST = 'import test from "node:test"\ntest("one", () => {})\n'

for (const [folder, decoys] of [
  ["{a,b}", ["a", "b"]],
  ["x+(b)", ["xb", "xbb"]],
  ["x@(b)", ["xb"]],
]) {
  test(`a file under a ${folder} folder runs its own test and no decoy (B27 review M-1)`, () => {
    const r = run(probeIn(folder, ONE_TEST, decoys))
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /^ok 1 - one$/m)
    assert.doesNotMatch(r.stdout, /decoy/)
    assert.match(r.stdout, /^# tests 1$/m)
  })
}

test("a pattern that matches nothing, or other files, is refused before node runs (B27 review M-1)", () => {
  const file = probeIn("{a,b}", ONE_TEST, ["a", "b"])
  const dir = path.dirname(path.dirname(file)).replace(/\\/g, "/")
  // The B27 brace escape: brace expansion still runs, so it matched the two decoys.
  assert.throws(() => assertPatternMatchesOnly(`${dir}/[{]a,b[}]/probe.test.mjs`, file), /does not match exactly/)
  // A pattern that matches the file and the decoys is refused too.
  assert.throws(() => assertPatternMatchesOnly(`${dir}/*/probe.test.mjs`, file), /matches: .*, .*, /)
  // No escaping at all: `[id]` is a class, so it matches nothing.
  const bracket = bracketDir(ONE_TEST)
  assert.throws(() => assertPatternMatchesOnly(bracket.replace(/\\/g, "/"), bracket), /matches: nothing/)
  assert.doesNotThrow(() => assertPatternMatchesOnly(escapeTestGlob(bracket), bracket))
  // The runner itself stops (exit 1, nothing run) when the escape is wrong.
  const errors = []
  const original = console.error
  console.error = (...args) => errors.push(args.join(" "))
  try {
    assert.equal(main([bracket], { escape: (f) => f.replace(/\\/g, "/") }), 1)
  } finally {
    console.error = original
  }
  assert.match(errors.join("\n"), /does not match exactly/)
})

test("a file that runs 0 tests fails the run (B27 review M-1)", () => {
  for (const [name, body] of [
    ["an empty file", "// no tests here\n"],
    ["a suite with no test", 'import { describe } from "node:test"\ndescribe("empty", () => {})\n'],
    ["only skipped and todo tests", 'import test from "node:test"\ntest("s", { skip: "off" }, () => {})\ntest.todo("later")\n'],
  ]) {
    const r = run(bracketDir(body))
    assert.equal(r.status, 1, `${name}: ${r.stdout}${r.stderr}`)
    assert.match(r.stderr, /: 0 tests ran \(/, name)
  }
  // One good file does not hide an empty one beside it.
  const r = run(bracketDir(ONE_TEST), bracketDir("// no tests here\n"))
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /^# run-node-test-files: files 2, ran 1, skipped 0, todo 0$/m)
  assert.equal(r.stderr.match(/0 tests ran/g)?.length, 1)
})

test("your reporter still prints to stdout beside the counting reporter", () => {
  assert.deepEqual(reporterFlags([], "/c.json", { tty: false }), [
    "--test-reporter=tap",
    "--test-reporter-destination=stdout",
    "--test-reporter=./scripts/test-shims/count-tests-reporter.mjs",
    "--test-reporter-destination=/c.json",
  ])
  assert.deepEqual(reporterFlags(["--test-reporter=dot"], "/c.json").slice(0, 2), [
    "--test-reporter=dot",
    "--test-reporter-destination=stdout",
  ])
  const r = run(bracketDir(ONE_TEST))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^TAP version 13$/m)
  assert.match(r.stdout, /^# run-node-test-files: files 1, ran 1, skipped 0, todo 0$/m)
})
