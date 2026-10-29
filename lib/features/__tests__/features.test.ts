/**
 * Feature switches (0111): resolution order (row, env, default; Vercel ones
 * env only), the 60 second store, client snapshot, toggle permissions, the
 * page model, and that no on/off env var is read outside the registry.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { clientFeatureOn, setClientFeatureSnapshot } from "@/lib/features/client"
import { buildFeaturePageModel } from "@/lib/features/pageModel"
import {
  CLIENT_FEATURE_KEYS,
  canToggleFeature,
  FEATURE_DEFINITIONS,
  featureDefinition,
  featureEnvValue,
  parseFeatureEnv,
  resolveFeature,
  type FeatureRow,
} from "@/lib/features/registry"
import {
  invalidateFeatureSwitches,
  isFeatureOn,
  readClientFeatureSnapshot,
  readFeatureStates,
  setFeatureRowReaderForTests,
} from "@/lib/features/server"
import { createFeatureRowStore } from "@/lib/features/store"

const row = (key: string, enabled: boolean, extra: Partial<FeatureRow> = {}): FeatureRow => ({
  key,
  enabled,
  updatedAt: "2026-10-30T09:00:00+11:00",
  updatedBy: 7,
  updatedByName: "Luke",
  note: null,
  ...extra,
})

test("env parsing matches each feature's old read exactly", () => {
  for (const v of ["on", "1", "true", " TRUE ", "On"]) assert.equal(parseFeatureEnv(v, "on_1_true"), true, v)
  for (const v of [undefined, "", "off", "yes"]) assert.equal(parseFeatureEnv(v, "on_1_true"), false, String(v))
  assert.equal(parseFeatureEnv("true", "exact_true"), true)
  assert.equal(parseFeatureEnv(" true ", "exact_true"), true)
  assert.equal(parseFeatureEnv("1", "exact_true"), false)
  assert.equal(parseFeatureEnv("TRUE", "exact_true"), false)
  assert.equal(parseFeatureEnv("true", "exact_true_raw"), true)
  assert.equal(parseFeatureEnv(" true", "exact_true_raw"), false)
  assert.equal(parseFeatureEnv("on", "on_only"), true)
  assert.equal(parseFeatureEnv(" ON ", "on_only"), true)
  assert.equal(parseFeatureEnv("true", "on_only"), false)
  assert.equal(parseFeatureEnv("1", "exact_1"), true)
  assert.equal(parseFeatureEnv("true", "exact_1"), false)
})

test("order: switch row, then env, then default; a Vercel switch is env only", () => {
  const trueUp = featureDefinition("true_up")!
  const rows = new Map([["true_up", row("true_up", false)]])
  assert.deepEqual(resolveFeature(trueUp, rows, { TRUE_UP: "on" }), { enabled: false, source: "switch" })
  assert.deepEqual(resolveFeature(trueUp, new Map(), { TRUE_UP: "on" }), { enabled: true, source: "env" })
  assert.deepEqual(resolveFeature(trueUp, null, { TRUE_UP: "on" }), { enabled: true, source: "env" })
  assert.deepEqual(resolveFeature(trueUp, null, {}), { enabled: false, source: "default" })
  assert.deepEqual(resolveFeature(trueUp, null, { TRUE_UP: "  " }), { enabled: false, source: "default" })
  const viewAs = featureDefinition("view_as")!
  const viewRows = new Map([["view_as", row("view_as", true)]])
  assert.deepEqual(resolveFeature(viewAs, viewRows, {}), { enabled: false, source: "vercel" })
  assert.deepEqual(resolveFeature(viewAs, null, { VIEW_AS_ENABLED: "on" }), { enabled: true, source: "vercel" })
})

test("store: one read per TTL, invalidate clears, a failed read caches null, concurrent reads share one call", async () => {
  let t = 0
  let calls = 0
  let fail = false
  const store = createFeatureRowStore(
    async () => {
      calls += 1
      if (fail) throw new Error("relation feature_switches does not exist")
      return new Map([["true_up", row("true_up", true)]])
    },
    { ttlMs: 60_000, now: () => t },
  )
  const [a, b] = await Promise.all([store.read(), store.read()])
  assert.equal(calls, 1)
  assert.equal(a, b)
  t = 59_999
  await store.read()
  assert.equal(calls, 1)
  t = 60_000
  await store.read()
  assert.equal(calls, 2)
  store.invalidate()
  await store.read()
  assert.equal(calls, 3)
  fail = true
  store.invalidate()
  assert.equal(await store.read(), null)
  t = 60_010
  assert.equal(await store.read(), null)
  assert.equal(calls, 4)
})

test("isFeatureOn: a row beats env; no table (0111 not run) falls back to env", async () => {
  try {
    setFeatureRowReaderForTests(async () => new Map([["web_search", row("web_search", true)]]))
    assert.equal(await isFeatureOn("web_search", {}), true)
    assert.equal(await isFeatureOn("codex_v2", { CODEX_V2: "on" }), true)
    assert.equal(await isFeatureOn("codex_v2", {}), false)
    setFeatureRowReaderForTests(async () => new Map([["web_search", row("web_search", false)]]))
    assert.equal(await isFeatureOn("web_search", { FEATURE_WEB_SEARCH: "on" }), false)
    setFeatureRowReaderForTests(async () => null)
    assert.equal(await isFeatureOn("web_search", { FEATURE_WEB_SEARCH: "on" }), true)
    setFeatureRowReaderForTests(async () => {
      throw new Error("db down")
    })
    assert.equal(await isFeatureOn("web_search", { FEATURE_WEB_SEARCH: "on" }), true)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("toggle invalidation: the next read after invalidate sees the new row", async () => {
  let enabled = false
  try {
    setFeatureRowReaderForTests(async () => new Map([["auto_reports", row("auto_reports", enabled)]]))
    assert.equal(await isFeatureOn("auto_reports", {}), false)
    enabled = true
    assert.equal(await isFeatureOn("auto_reports", {}), false, "cached within the TTL")
    invalidateFeatureSwitches()
    assert.equal(await isFeatureOn("auto_reports", {}), true)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("client snapshot carries only the browser switches, and the browser reads it", async () => {
  try {
    setFeatureRowReaderForTests(async () => new Map([["plan_drafts", row("plan_drafts", true)]]))
    const snap = await readClientFeatureSnapshot({ NEXT_PUBLIC_BILLING_BALANCER: "on" })
    assert.deepEqual(Object.keys(snap).sort(), [...CLIENT_FEATURE_KEYS].sort())
    assert.equal(snap.plan_drafts, true)
    assert.equal(snap.billing_balancer, true)
    assert.equal(snap.true_up, false)
    setClientFeatureSnapshot(snap)
    assert.equal(clientFeatureOn("plan_drafts"), true)
    assert.equal(clientFeatureOn("true_up"), false)
  } finally {
    setClientFeatureSnapshot(null)
    setFeatureRowReaderForTests(null)
  }
})

test("readFeatureStates reports ready and each source", async () => {
  try {
    setFeatureRowReaderForTests(async () => new Map([["true_up", row("true_up", true)]]))
    const { ready, states } = await readFeatureStates({ CODEX_V2: "on" })
    assert.equal(ready, true)
    assert.equal(states.find((s) => s.key === "true_up")?.source, "switch")
    assert.equal(states.find((s) => s.key === "codex_v2")?.source, "env")
    assert.equal(states.find((s) => s.key === "web_search")?.source, "default")
    assert.equal(states.find((s) => s.key === "view_as")?.source, "vercel")
    setFeatureRowReaderForTests(async () => null)
    assert.equal((await readFeatureStates({})).ready, false)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("who can toggle: finance switches need finance admin, Vercel switches nobody", () => {
  const trueUp = featureDefinition("true_up")!
  const web = featureDefinition("web_search")!
  const viewAs = featureDefinition("view_as")!
  assert.equal(canToggleFeature(trueUp, { admin: true, financeAdmin: false }), false)
  assert.equal(canToggleFeature(trueUp, { admin: true, financeAdmin: true }), true)
  assert.equal(canToggleFeature(web, { admin: true, financeAdmin: false }), true)
  assert.equal(canToggleFeature(web, { admin: false, financeAdmin: false }), false)
  assert.equal(canToggleFeature(viewAs, { admin: true, financeAdmin: true }), false)
})

test("page model: groups, source labels, hints and toggle state", () => {
  const groups = buildFeaturePageModel({
    ready: true,
    states: [
      { key: "true_up", enabled: false, source: "default", row: null },
      { key: "true_up_actions", enabled: true, source: "switch", row: row("true_up_actions", true, { note: "smoke done" }) },
      { key: "codex_v2", enabled: true, source: "env", row: null },
      { key: "view_as", enabled: true, source: "vercel", row: null },
    ],
    roles: { admin: true, financeAdmin: true },
  })
  assert.deepEqual(groups.map((g) => g.area), ["finance", "planning", "reporting", "clients", "platform"])
  const all = groups.flatMap((g) => g.rows)
  assert.equal(all.length, FEATURE_DEFINITIONS.length)
  const actions = all.find((r) => r.key === "true_up_actions")!
  assert.equal(actions.sourceLabel, "Switch")
  assert.match(actions.hint ?? "", /Also needs True-up report on/)
  assert.match(actions.lastChanged ?? "", /by Luke/)
  assert.equal(actions.note, "smoke done")
  assert.equal(all.find((r) => r.key === "codex_v2")!.sourceLabel, "Env var CODEX_V2")
  const viewAs = all.find((r) => r.key === "view_as")!
  assert.equal(viewAs.sourceLabel, "Set in Vercel")
  assert.equal(viewAs.canToggle, false)
  const notReady = buildFeaturePageModel({ ready: false, states: [], roles: { admin: true, financeAdmin: true } })
  assert.ok(notReady.flatMap((g) => g.rows).every((r) => !r.canToggle))
})

test("featureEnvValue is the env-only read for pure helpers", () => {
  assert.equal(featureEnvValue("true_up", { TRUE_UP: "on" }), true)
  assert.equal(featureEnvValue("xero_credit_notes", { XERO_SYNC_CREDIT_NOTES: "1" }), false)
})

const ROOT = process.cwd()
const SCAN_DIRS = ["app", "lib", "components", "hooks", "contexts"]
/** Files allowed to name a switch's env var in code. */
const ALLOWED = new Set([
  "lib/features/registry.ts",
  "lib/features/client.ts",
  // VIEW_AS_ENABLED stays an env read: middleware can't query the database.
  "lib/auth/viewAs.ts",
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

test("every on/off switch is read through the registry: no file reads its env var directly", () => {
  const names = FEATURE_DEFINITIONS.map((d) => d.envName)
  const extra = ["NEXT_PUBLIC_TRUE_UP", "NEXT_PUBLIC_BILLING_REVISIONS"]
  const offenders: string[] = []
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/")
      if (ALLOWED.has(rel)) continue
      const src = readFileSync(file, "utf8")
      for (const name of [...names, ...extra]) {
        const read = new RegExp(`(process\\.env|\\benv)\\??\\.${name}\\b|env\\[["']${name}["']\\]`)
        if (read.test(src)) offenders.push(`${rel}: ${name}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})
