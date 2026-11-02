/**
 * Self-test for scripts/check-money-inline.mjs (B7, G1): the new patterns
 * count, and the baseline only goes down.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../check-money-inline.mjs")

function makeRoot(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "money-inline-"))
  for (const [rel, src] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, src)
  }
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true })
  if (baseline) fs.writeFileSync(path.join(root, "scripts/money-inline-baseline.json"), JSON.stringify(baseline))
  return root
}

function run(root, ...args) {
  return spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" })
}

function readBaseline(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "scripts/money-inline-baseline.json"), "utf8"))
}

const NEW_PATTERNS = {
  "lib/a_parse_float.ts": `export const a = (v: string) => parseFloat(v.replace(/[^0-9.]/g, ""))`,
  "lib/a_number_digit.ts": `export const a = (v: string) => Number(String(v).replace(/[^\\d.-]/g, ""))`,
  "components/a_pct_guess.tsx": `export const p = (v: number) => (v <= 1 ? v * 100 : v)`,
  "components/a_pct_guess_gt.tsx": `export const p = (v: number) => (v > 1 ? v : v * 100)`,
  "components/a_fee_split.tsx": `export const m = (b: number, feePct: number) => b * (100 - feePct)`,
  "lib/f_round_money.ts": `function roundMoney(n: number) { return n }\nexport const r = roundMoney`,
  "lib/f_parse_currency.ts": `export const parseCurrency = (v: string) => v`,
  "lib/f_names.ts": [
    "export function roundMoneyCents(n: number) { return n }",
    "export function parseMoneySaved(n: number) { return n }",
    "export function parseScheduleMoney(n: number) { return n }",
    "export function toCurrencyNumber(n: number) { return n }",
    "export function parseDollars(n: number) { return n }",
    "export function parseBillingScheduleAmount(n: number) { return n }",
  ].join("\n"),
}

const CLEAN = {
  "lib/c_comment.ts": `// parseFloat(v.replace(/[^0-9.]/g, "")) and v <= 1 ? v * 100 : v\nexport const a = 1`,
  "lib/c_import.ts": `import { parseMoney } from "@/lib/money"\nexport const a = parseMoney("1")`,
  "lib/c_plain_number.ts": `export const a = (v: string) => Number(v) + parseFloat(v)`,
  "lib/money/parse.ts": `export function parseCurrency(v: string) { return parseFloat(v.replace(/[^0-9.]/g, "")) }`,
  "lib/__tests__/t.test.ts": `export const a = (v: string) => parseFloat(v.replace(/[^0-9.]/g, ""))`,
}

test("each new G1 pattern is counted; comments, lib/money and tests are not", () => {
  const root = makeRoot({ ...NEW_PATTERNS, ...CLEAN }, null)
  try {
    const r = run(root, "--reseed")
    assert.equal(r.status, 0, r.stderr)
    const baseline = readBaseline(root)
    assert.equal(baseline["lib/a_parse_float.ts"], 1)
    assert.equal(baseline["lib/a_number_digit.ts"], 1)
    assert.equal(baseline["components/a_pct_guess.tsx"], 1)
    assert.equal(baseline["components/a_pct_guess_gt.tsx"], 1)
    assert.equal(baseline["components/a_fee_split.tsx"], 1)
    assert.equal(baseline["lib/f_round_money.ts"], 1)
    assert.equal(baseline["lib/f_parse_currency.ts"], 1)
    assert.equal(baseline["lib/f_names.ts"], 6)
    for (const rel of Object.keys(CLEAN)) assert.equal(baseline[rel], undefined, rel)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a rise fails the check, and --update refuses to raise the baseline", () => {
  const root = makeRoot(
    { "lib/x.ts": `export const a = (v: string) => parseFloat(v.replace(/[^0-9.]/g, ""))\nexport const b = (v: string) => parseFloat(v.replace(/[^0-9.]/g, ""))` },
    { "lib/x.ts": 1 },
  )
  try {
    assert.equal(run(root).status, 1)
    const u = run(root, "--update")
    assert.equal(u.status, 1)
    assert.match(u.stderr, /only lowers the baseline/)
    assert.deepEqual(readBaseline(root), { "lib/x.ts": 1 })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a new file fails and --update does not add it", () => {
  const root = makeRoot({ "lib/new.ts": `export const parseDollars = (v: string) => v` }, {})
  try {
    assert.equal(run(root).status, 1)
    assert.equal(run(root, "--update").status, 1)
    assert.deepEqual(readBaseline(root), {})
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a drop passes, and --update lowers the count and drops files at 0", () => {
  const root = makeRoot(
    { "lib/x.ts": `export const a = (v: string) => parseFloat(v.replace(/[^0-9.]/g, ""))`, "lib/y.ts": "export const a = 1" },
    { "lib/x.ts": 3, "lib/y.ts": 2 },
  )
  try {
    const c = run(root)
    assert.equal(c.status, 0, c.stderr)
    assert.match(c.stdout, /4 under baseline/)
    assert.equal(run(root, "--update").status, 0)
    assert.deepEqual(readBaseline(root), { "lib/x.ts": 1 })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
