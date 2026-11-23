/**
 * Self-test for the S10 measure rule (scripts/measure-registry.mjs). New screen
 * code that computes a measure fails lint; server code and non-measure maths
 * pass; a baseline file fails one hit over its count; every baseline count is
 * exact, so a drop must lower the JSON; every registered function exists.
 * ESLint runs as a process (`eslint` is not a listed dependency).
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { MEASURE_BASELINE, MEASURES } from "../measure-registry.mjs"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const RULE = "measures/no-local-measure"

/** The measure rule's message lines per repo path (`rule` picks another rule). `noBaseline` lints with every count at 0. */
function lint(args, { input, noBaseline = false, rule = RULE } = {}) {
  const extra = noBaseline ? ["--rule", JSON.stringify({ [RULE]: ["error", { baseline: {} }] })] : []
  const run = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--format", "json", "--no-warn-ignored", ...extra, ...args], { cwd: repo, input, encoding: "utf8", maxBuffer: 1 << 26 })
  assert.ok(run.stdout, run.stderr)
  const out = {}
  for (const r of JSON.parse(run.stdout)) {
    assert.deepEqual(r.messages.filter((m) => m.fatal), [], r.filePath)
    out[path.relative(repo, r.filePath)] = r.messages.filter((m) => m.ruleId === rule).map((m) => m.line)
  }
  return out
}
const lintSource = (file, src) => lint(["--stdin", "--stdin-filename", file], { input: src })[file] ?? []

const LOCAL = [
  "export function pace(actualSpend: number, expectedSpend: number) {",
  "  return (actualSpend / expectedSpend) * 100",
  "}",
  "export const used = (row: { spend: number; budget: number }) => 100 * (row.spend / row.budget)",
  "export const left = (delivered: number, planned: number) => (delivered * 100) / planned",
  "export const expected = (plannedImpressions: number, elapsed: number, totalDays: number) => plannedImpressions * Math.min(1, elapsed / totalDays)",
  "export const unit = (cost: number, all: number) => (cost / all) * 100",
  "export const snake = (total_spend: number, n: number) => (total_spend / n) * 100",
].join("\n")

test("a new screen that computes a measure fails, one message per shape", () => {
  assert.deepEqual(lintSource("components/dashboard/NewScreen.tsx", LOCAL), [2, 4, 5, 6, 7, 8])
  assert.deepEqual(lintSource("app/dashboard/new/page.tsx", LOCAL), [2, 4, 5, 6, 7, 8])
})

test("server code, tests and non-measure maths pass", () => {
  assert.deepEqual(lintSource("app/api/new/route.ts", LOCAL), [])
  assert.deepEqual(lintSource("lib/pacing/newMeasure.ts", LOCAL), [])
  assert.deepEqual(lintSource("components/dashboard/__tests__/x.test.tsx", LOCAL), [])
  const plain = "export const w = (value: number, max: number) => (value / max) * 100\nexport const x = (i: number, totalDays: number, width: number) => (i / totalDays) * width"
  assert.deepEqual(lintSource("components/ui/Bar.tsx", plain), [])
  // A measure word inside another word is not a measure name.
  const words = [
    "export const a = (e: { target: { value: number } }, max: number) => (e.target.value / max) * 100",
    "export const b = (feedbackCount: number, all: number) => (feedbackCount / all) * 100",
    "export const c = (immediateCount: number, all: number) => 100 * (immediateCount / all)",
    "export const d = (costumeCount: number, all: number) => (100 * costumeCount) / all",
  ].join("\n")
  assert.deepEqual(lintSource("components/ui/Slider.tsx", words), [])
})

test("a baseline file passes at its count and fails one over", () => {
  const [file, count] = Object.entries(MEASURE_BASELINE)[0]
  const src = readFileSync(path.join(repo, file), "utf8")
  assert.deepEqual(lintSource(file, src), [])
  const lines = lintSource(file, `${src}\nexport const s10Planted = (spend: number, budget: number) => (spend / budget) * 100\n`)
  assert.equal(lines.length, count + 1)
})

test("every baseline count is exact (a drop lowers scripts/measure-baseline.json)", () => {
  const files = Object.keys(MEASURE_BASELINE)
  const counts = lint(files, { noBaseline: true })
  assert.deepEqual(Object.fromEntries(files.map((f) => [f, counts[f]?.length ?? 0])), MEASURE_BASELINE)
})

test("every registered measure names a function its module exports", async () => {
  assert.equal(new Set(MEASURES.map((m) => m.measure)).size, MEASURES.length)
  for (const m of MEASURES) {
    const mod = await import(pathToFileURL(path.join(repo, m.module)).href)
    assert.equal(typeof mod[m.fn], "function", `${m.module} ${m.fn}`)
  }
})

const BANDS = [
  'import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"',
  'import { pacingStatus, statusFromExpectedPct } from "@/lib/pacing/status"',
  'import { deliveryStatusFromPct as band } from "../../lib/pacing/deliveryStatusFromPct"',
  'import { pacingStatus as label } from "@/lib/pacing/status"',
  "export const all = [deliveryStatusFromPct, statusFromExpectedPct, pacingStatus, band, label]",
].join("\n")
const bandLines = (file) => lint(["--stdin", "--stdin-filename", file], { input: BANDS, rule: "no-restricted-imports" })[file] ?? []

test("a screen may not import the raw band helpers, in any spelling, a Codex-governed screen included", () => {
  assert.deepEqual(bandLines("components/dashboard/NewCard.tsx"), [1, 2, 3])
  assert.deepEqual(bandLines("app/dashboard/[slug]/NewCard.tsx"), [1, 2, 3])
  // CreativeAdminLanding has its own C-200 block (codexImportBlocks), which keeps the ban through restrictedImportsFor.
  assert.deepEqual(bandLines("components/creative/CreativeAdminLanding.tsx"), [1, 2, 3])
})

test("lib, routes and tests may import the band helpers", () => {
  assert.deepEqual(bandLines("lib/pacing/newBand.ts"), [])
  assert.deepEqual(bandLines("app/api/new/route.ts"), [])
  assert.deepEqual(bandLines("components/dashboard/__tests__/x.test.tsx"), [])
})
