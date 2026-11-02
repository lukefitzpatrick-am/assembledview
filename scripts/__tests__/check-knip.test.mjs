/** Self-test for scripts/check-knip.mjs (B7, G4), on saved knip JSON. */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { findingsFromKnipJson } from "../check-knip.mjs"

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../check-knip.mjs")

const REPORT = {
  issues: [
    { file: "lib/dead.ts", files: [{ name: "lib/dead.ts" }], dependencies: [], unlisted: [], exports: [{ name: "x" }] },
    { file: "package.json", dependencies: [{ name: "left-pad" }], devDependencies: [{ name: "old-tool" }], files: [] },
    { file: "lib/img.ts", unlisted: [{ name: "sharp" }], unresolved: [{ name: "./gone" }] },
  ],
}

test("findingsFromKnipJson keeps files, deps, devDeps and unlisted; ignores exports and unresolved", () => {
  assert.deepEqual(findingsFromKnipJson(REPORT), [
    "dependencies:left-pad",
    "devDependencies:old-tool",
    "files:lib/dead.ts",
    "unlisted:sharp lib/img.ts",
  ])
})

function setup(baseline, report) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-knip-"))
  fs.mkdirSync(path.join(root, "scripts"))
  if (baseline) fs.writeFileSync(path.join(root, "scripts/knip-baseline.json"), JSON.stringify(baseline))
  const json = path.join(root, "report.json")
  fs.writeFileSync(json, JSON.stringify(report))
  return { root, json }
}
const run = ({ root, json }, ...args) =>
  spawnSync(process.execPath, [script, "--root", root, "--from-json", json, ...args], { encoding: "utf8" })
const baselineOf = ({ root }) => JSON.parse(fs.readFileSync(path.join(root, "scripts/knip-baseline.json"), "utf8"))

test("a new finding fails, and --update does not add it", () => {
  const t = setup(["files:lib/dead.ts", "dependencies:left-pad", "devDependencies:old-tool"], REPORT)
  try {
    const r = run(t)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /unlisted:sharp lib\/img\.ts/)
    assert.equal(run(t, "--update").status, 1)
    assert.deepEqual(baselineOf(t), ["files:lib/dead.ts", "dependencies:left-pad", "devDependencies:old-tool"])
  } finally {
    fs.rmSync(t.root, { recursive: true, force: true })
  }
})

test("a fixed finding passes, and --update removes it", () => {
  const t = setup(
    ["dependencies:left-pad", "devDependencies:old-tool", "files:lib/dead.ts", "files:lib/was-dead.ts", "unlisted:sharp lib/img.ts"],
    REPORT,
  )
  try {
    const r = run(t)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /1 fixed/)
    assert.equal(run(t, "--update").status, 0)
    assert.deepEqual(baselineOf(t), findingsFromKnipJson(REPORT))
  } finally {
    fs.rmSync(t.root, { recursive: true, force: true })
  }
})

test("knip.json hides no package except the FlatCompat false positive", () => {
  const knip = JSON.parse(fs.readFileSync(path.resolve(path.dirname(script), "../knip.json"), "utf8"))
  assert.deepEqual(knip.ignoreDependencies ?? [], ["eslint-config-next"])
})
