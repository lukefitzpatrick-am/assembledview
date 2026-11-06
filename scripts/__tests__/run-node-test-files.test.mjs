/** Self-test for scripts/run-node-test-files.mjs (C-179): bracket paths run their tests. */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  assertPatternMatchesOnly,
  escapeTestGlob,
  main,
  missingRequiredFlags,
  moduleMocksWork,
  realPath,
  reporterFlags,
  testPattern,
} from "../run-node-test-files.mjs"

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

/** A new temp dir, as its real path: on Windows `os.tmpdir()` can be an 8.3 short name. */
function tempDir() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "run-node-test-files-")))
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

test("module mocks are on, so tests that need them cannot skip and pass (B27 review L-1)", () => {
  assert.deepEqual(missingRequiredFlags(["--import", "tsx", "--test", "--experimental-test-module-mocks"]), [
    "--experimental-test-module-mocks",
  ])
  assert.deepEqual(missingRequiredFlags(["--experimental-test-module-mocks", "--import", "tsx", "--test"]), [])
  assert.equal(moduleMocksWork(), true)
  assert.equal(moduleMocksWork([]), false, "without the flag Node has no mock.module")
  const r = run(
    bracketDir(
      'import assert from "node:assert"\nimport test, { mock } from "node:test"\n' +
        'test("mock.module is there", () => assert.equal(typeof mock.module, "function"))\n',
    ),
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^# run-node-test-files: files 1, ran 1, skipped 0, todo 0$/m)
})

/**
 * B27 review M-2: every node:test file under a glob-character path is in
 * `test:bracket-routes`, so a new one cannot sit in no suite.
 * - Files: `git ls-files --cached --others --exclude-standard` (tracked, and
 *   new files not yet added). A glob-character path has `[`, `]`, `{`, `}`,
 *   `*` or `?`, or an extglob opener such as `+(` or `@(`, anywhere in it.
 * - node:test or Vitest: the repo tells them apart by import. A node:test
 *   file imports `node:test` (the per-file node suite greps for the same
 *   thing). A Vitest file imports `vitest` and is listed in
 *   `vitest.config.ts` `test.include`. A file that imports both fails here.
 */
const GLOB_PATH = /[[\]{}*?]|[+@!](?=\()/
const IMPORTS_NODE_TEST = /["']node:test["']/
const IMPORTS_VITEST = /from\s+["']vitest["']/

function globPathTestFiles() {
  const r = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
  assert.equal(r.status, 0, `git ls-files failed: ${r.stderr}`)
  const nodeTest = []
  const vitest = []
  for (const file of r.stdout.split("\0")) {
    if (!file || !GLOB_PATH.test(file) || !/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(file)) continue
    if (!fs.existsSync(path.join(root, file))) continue
    const src = fs.readFileSync(path.join(root, file), "utf8")
    const isNode = IMPORTS_NODE_TEST.test(src)
    const isVitest = IMPORTS_VITEST.test(src)
    assert.ok(!(isNode && isVitest), `${file} imports both node:test and vitest`)
    if (isNode) nodeTest.push(file)
    if (isVitest) vitest.push(file)
  }
  return { nodeTest: nodeTest.sort(), vitest: vitest.sort() }
}

test("every node:test file under a bracket or glob path is in test:bracket-routes (B27 review M-2)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const script = pkg.scripts["test:bracket-routes"]
  assert.match(script, /^node scripts\/run-node-test-files\.mjs /)
  const listed = [...script.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
  const { nodeTest, vitest } = globPathTestFiles()
  assert.ok(nodeTest.length >= 9, `found ${nodeTest.length} node:test files under bracket paths`)
  const missing = nodeTest.filter((f) => !listed.includes(f))
  const extra = listed.filter((f) => !nodeTest.includes(f))
  assert.deepEqual(missing, [], "add these to test:bracket-routes in package.json")
  assert.deepEqual(extra, [], "test:bracket-routes lists files that are not node:test files under a bracket path")
  // The Vitest files under bracket paths run through Vitest, which lists them by name.
  const vitestConfig = fs.readFileSync(path.join(root, "vitest.config.ts"), "utf8")
  for (const file of vitest) assert.ok(vitestConfig.includes(`"${file}"`), `${file} is not in vitest.config.ts`)
})

test("a file given by another spelling of its path is escaped and checked by its real path (B27 review, Windows)", () => {
  // On Windows a short 8.3 TEMP name is one such spelling. A link is the one every platform has.
  const file = bracketDir(ONE_TEST)
  const real = path.dirname(path.dirname(file))
  const link = path.join(tempDir(), "link")
  fs.symlinkSync(real, link, "junction")
  const viaLink = path.join(link, "[id]", "probe.test.mjs")
  assert.equal(realPath(viaLink), file)
  assert.equal(testPattern(viaLink, { root, cwd: root }), escapeTestGlob(file))
  assert.doesNotThrow(() => assertPatternMatchesOnly(testPattern(viaLink, { root, cwd: root }), viaLink))
  const r = run(viaLink)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^# run-node-test-files: files 1, ran 1, skipped 0, todo 0$/m)
})
