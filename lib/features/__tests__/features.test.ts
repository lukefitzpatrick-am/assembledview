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
  unsavedFeatureSwitches,
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

test("isFeatureOn: a row beats env; a failed read falls back to env", async () => {
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

test("codex_v2 (F1): a row wins over CODEX_V2 both ways; no row reads the env; with no row it is listed for Save current values", async () => {
  const def = featureDefinition("codex_v2")!
  assert.equal(def.envName, "CODEX_V2", "the env fallback stays until production has a row (F1)")
  assert.deepEqual(resolveFeature(def, new Map([["codex_v2", row("codex_v2", false)]]), { CODEX_V2: "on" }), { enabled: false, source: "switch" })
  assert.deepEqual(resolveFeature(def, new Map([["codex_v2", row("codex_v2", true)]]), {}), { enabled: true, source: "switch" })
  assert.deepEqual(resolveFeature(def, new Map(), { CODEX_V2: "on" }), { enabled: true, source: "env" })
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
  // A failed switch read gives no rows: CODEX_V2 is read again (L5, until the fallback goes).
  assert.deepEqual(resolveFeature(def, null, { CODEX_V2: "on" }), { enabled: true, source: "env" })
  const unsaved = unsavedFeatureSwitches(new Map(), { CODEX_V2: "on" })
  assert.deepEqual(unsaved.find((u) => u.key === "codex_v2"), { key: "codex_v2", enabled: true, source: "env" })
  try {
    setFeatureRowReaderForTests(async () => new Map([["codex_v2", row("codex_v2", false)]]))
    assert.equal(await isFeatureOn("codex_v2", { CODEX_V2: "on" }), false)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("roster_rules (B53, S18): new switch, default off, no env fallback, no requires, needs 0119, sent to the browser", () => {
  const def = featureDefinition("roster_rules")!
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.equal(def.requires, undefined)
  assert.equal(def.requiresMarker, "0119_team_members_roster_rules")
  assert.equal(def.clientVisible, true)
  assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes("roster_rules"))
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
})

test("codex_roster_aliases (F16): new switch, default off, no env fallback, needs codex_v2, sent to the browser", () => {
  const def = featureDefinition("codex_roster_aliases")!
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.deepEqual(def.requires, ["codex_v2"])
  assert.equal(def.clientVisible, true)
  assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes("codex_roster_aliases"))
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
})

test("codex_search (F8): new switch, default off, no env fallback, needs codex_v2, sent to the browser", () => {
  const def = featureDefinition("codex_search")!
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.deepEqual(def.requires, ["codex_v2"])
  assert.equal(def.clientVisible, true)
  assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes("codex_search"))
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
})

test("codex_saved_views (F8): new switch, default off, no env fallback, needs codex_v2, sent to the browser", () => {
  const def = featureDefinition("codex_saved_views")!
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.deepEqual(def.requires, ["codex_v2"])
  assert.equal(def.clientVisible, true)
  assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes("codex_saved_views"))
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
})

test("codex_projects (S1, B38): new switch, default off, no env fallback, needs codex_v2, sent to the browser", async () => {
  const def = featureDefinition("codex_projects")!
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.deepEqual(def.requires, ["codex_v2"])
  assert.equal(def.clientVisible, true)
  assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes("codex_projects"))
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
  try {
    setFeatureRowReaderForTests(async () => new Map([["codex_projects", row("codex_projects", true)]]))
    assert.equal(await isFeatureOn("codex_projects", {}), false, "B48: off while codex_v2 is off")
    setFeatureRowReaderForTests(async () => new Map([["codex_projects", row("codex_projects", true)], ["codex_v2", row("codex_v2", true)]]))
    assert.equal(await isFeatureOn("codex_projects", {}), true)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("codex_notifications (B41): new switch, default off, no env fallback, needs codex_projects, sent to the browser", () => {
  const def = featureDefinition("codex_notifications")!
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.deepEqual(def.requires, ["codex_projects"])
  assert.equal(def.clientVisible, true)
  assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes("codex_notifications"))
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
})

for (const key of ["codex_progress_field", "codex_my_work"]) {
  test(`${key} (B42): new switch, default off, no env fallback, needs codex_projects, sent to the browser`, () => {
    const def = featureDefinition(key)!
    assert.equal(def.defaultOn, false)
    assert.equal(def.envName, undefined)
    assert.deepEqual(def.requires, ["codex_projects"])
    assert.equal(def.clientVisible, true)
    assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes(key))
    assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
  })
}

test("codex_progress_field's description names the 409 progress_conflict refusal it turns on (PACK3 review P5)", () => {
  assert.match(featureDefinition("codex_progress_field")!.description, /409 progress_conflict/)
})

test("codex_progress_field's description says a link saved while the switch was off must be linked again (PACK4fix R6)", () => {
  assert.match(featureDefinition("codex_progress_field")!.description, /saved while this switch was off set nothing on done tasks: after turning it on, link the field again/)
})

test("codex_contained_writes (B44, C-200): new switch, default off, no env fallback, needs codex_v2, sent to the browser", () => {
  const def = featureDefinition("codex_contained_writes")!
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.deepEqual(def.requires, ["codex_v2"])
  assert.equal(def.clientVisible, true)
  assert.equal(def.area, "platform")
  assert.equal(def.toggleRole, "admin")
  assert.ok((CLIENT_FEATURE_KEYS as readonly string[]).includes("codex_contained_writes"))
  assert.deepEqual(resolveFeature(def, null, {}), { enabled: false, source: "default" })
  assert.match(def.description, /C-200/)
  assert.match(def.description, /never saves on load/)
  assert.match(def.description, /Off: each page keeps its own dialog and writes as before/)
  assert.match(def.description, /List shortened/, "PACK4fix R6: a long change list is cut to fit the link")
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

test("G9: every page switch with no row is listed with the value it has now; Vercel ones never", () => {
  const pageSwitches = FEATURE_DEFINITIONS.filter((d) => d.source === "switch").map((d) => d.key)
  // 16 page switches today (the review report counted 18 on 31 Oct); view_as stays in Vercel.
  assert.ok(pageSwitches.length >= 16)
  const none = unsavedFeatureSwitches(null, {})
  assert.deepEqual(none.map((u) => u.key), pageSwitches)
  assert.ok(!none.some((u) => u.key === "view_as"))
  assert.equal(none.find((u) => u.key === "unmapped_delivery")?.enabled, true, "default on")
  assert.equal(none.find((u) => u.key === "web_search")?.source, "default")

  const rows = new Map([
    ["true_up", row("true_up", false)],
    ["codex_v2", row("codex_v2", true)],
  ])
  const some = unsavedFeatureSwitches(rows, { TRUE_UP: "on", FEATURE_WEB_SEARCH: "on", CODEX_V2: "" })
  assert.equal(some.length, pageSwitches.length - 2)
  assert.ok(!some.some((u) => u.key === "true_up" || u.key === "codex_v2"), "a saved switch is not listed, whatever its env says")
  assert.deepEqual(some.find((u) => u.key === "web_search"), { key: "web_search", enabled: true, source: "env" })

  const all = new Map(pageSwitches.map((k) => [k, row(k, false)]))
  assert.deepEqual(unsavedFeatureSwitches(all, { TRUE_UP: "on" }), [])
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
  const names = FEATURE_DEFINITIONS.flatMap((d) => ("envName" in d && d.envName ? [d.envName] : []))
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

test("B34: relabel_map_one_active_guard and pacing_digest_data_checks are off by default, admin page switches, no env", async () => {
  for (const key of ["relabel_map_one_active_guard", "pacing_digest_data_checks"] as const) {
    const def = featureDefinition(key)!
    assert.ok(def, key)
    assert.equal(def.defaultOn, false, key)
    assert.equal(def.envName, undefined, key)
    assert.equal(def.source, "switch", key)
    assert.equal(def.toggleRole, "admin", key)
    assert.equal(def.clientVisible, false, key)
    try {
      setFeatureRowReaderForTests(async () => new Map())
      assert.equal(await isFeatureOn(key, {}), false, `${key} with no row`)
      setFeatureRowReaderForTests(async () => new Map([[key, row(key, true)]]))
      assert.equal(await isFeatureOn(key, {}), true, `${key} with a row on`)
    } finally {
      setFeatureRowReaderForTests(null)
    }
  }
})

test("B34fix: the digest data checks switch names the cron's real schedule and read count", () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>
  }
  const cron = vercel.crons.find((c) => c.path === "/api/cron/pacing-digest")
  assert.equal(cron?.schedule, "30 22 * * 1,4", "Mon and Thu 22:30 UTC: if this changes, fix the wording below")
  const description = featureDefinition("pacing_digest_data_checks")!.description
  assert.match(description, /Tue and Fri 09:30 AEDT, 08:30 AEST/)
  assert.doesNotMatch(description, /07:00|7am/)
  assert.match(description, /two or three Snowflake reads/)
  assert.match(description, /45 seconds/)
})

test("B35: billing_ghost_row_finance_guard is off by default, a finance switch admins toggle, sent to the browser, no env", async () => {
  const key = "billing_ghost_row_finance_guard" as const
  const def = featureDefinition(key)!
  assert.ok(def, key)
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.equal(def.source, "switch")
  assert.equal(def.toggleRole, "admin")
  assert.equal(def.area, "finance")
  assert.equal(def.clientVisible, true)
  setClientFeatureSnapshot(null)
  assert.equal(clientFeatureOn(key), false, "no snapshot: the default")
  try {
    setFeatureRowReaderForTests(async () => new Map())
    assert.equal(await isFeatureOn(key, {}), false, "no row")
    setFeatureRowReaderForTests(async () => new Map([[key, row(key, true)]]))
    assert.equal(await isFeatureOn(key, {}), true, "a row on")
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("B43: finance_melbourne_month is off by default, a finance switch admins toggle, sent to the browser, no env", async () => {
  const key = "finance_melbourne_month" as const
  const def = featureDefinition(key)!
  assert.ok(def, key)
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.equal(def.source, "switch")
  assert.equal(def.toggleRole, "admin")
  assert.equal(def.area, "finance")
  assert.equal(def.clientVisible, true)
  assert.equal(def.requires, undefined)
  assert.match(def.description, /first 10 hours of each month \(11 in daylight saving\)/)
  assert.match(def.description, /Off: the server's month, as before\./)
  // B43fix (R8): every view the switch moves is named, fixed cost margin included.
  for (const view of ["Finance summary", "Publishers", "client pays", "fixed cost margin", "investment cut", "scope bar"]) {
    assert.ok(def.description.includes(view), view)
  }
  setClientFeatureSnapshot(null)
  assert.equal(clientFeatureOn(key), false, "no snapshot: the default")
  try {
    setFeatureRowReaderForTests(async () => new Map())
    assert.equal(await isFeatureOn(key, {}), false, "no row")
    setFeatureRowReaderForTests(async () => new Map([[key, row(key, true)]]))
    assert.equal(await isFeatureOn(key, {}), true, "a row on")
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("B35: burst_overlap_warning is off by default, a planning switch sent to the browser, no env", async () => {
  const key = "burst_overlap_warning" as const
  const def = featureDefinition(key)!
  assert.ok(def, key)
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.equal(def.source, "switch")
  assert.equal(def.toggleRole, "admin")
  assert.equal(def.area, "planning")
  assert.equal(def.clientVisible, true)
  setClientFeatureSnapshot(null)
  assert.equal(clientFeatureOn(key), false)
  setClientFeatureSnapshot({ [key]: true })
  assert.equal(clientFeatureOn(key), true)
  setClientFeatureSnapshot(null)
  try {
    setFeatureRowReaderForTests(async () => new Map())
    assert.equal(await isFeatureOn(key, {}), false)
    setFeatureRowReaderForTests(async () => new Map([[key, row(key, true)]]))
    assert.equal(await isFeatureOn(key, {}), true)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("B54: publish_validation is off by default, a planning switch sent to the browser, no env, owned by Luke, needs expert_package_quantity (V36 A)", async () => {
  const key = "publish_validation" as const
  const def = featureDefinition(key)!
  assert.ok(def, key)
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.equal(def.source, "switch")
  assert.equal(def.toggleRole, "admin")
  assert.equal(def.area, "planning")
  assert.equal(def.clientVisible, true)
  assert.equal(def.owner, "Luke")
  assert.deepEqual(def.requires, ["expert_package_quantity"])
  setClientFeatureSnapshot(null)
  assert.equal(clientFeatureOn(key), false)
  setClientFeatureSnapshot({ [key]: true })
  assert.equal(clientFeatureOn(key), true)
  setClientFeatureSnapshot(null)
  try {
    setFeatureRowReaderForTests(async () => new Map())
    assert.equal(await isFeatureOn(key, {}), false)
    setFeatureRowReaderForTests(async () => new Map([[key, row(key, true)]]))
    assert.equal(await isFeatureOn(key, {}), false, "reads off without expert_package_quantity")
    const needs = ["expert_package_quantity", "fixed_cost_report_net"] as const
    setFeatureRowReaderForTests(async () => new Map([key, ...needs].map((k) => [k, row(k, true)])))
    assert.equal(await isFeatureOn(key, {}), true)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("B56: billed_months_choice is off by default, a finance switch the browser never reads, no env, owned by Luke", async () => {
  const key = "billed_months_choice" as const
  const def = featureDefinition(key)!
  assert.ok(def, key)
  assert.equal(def.defaultOn, false)
  assert.equal(def.envName, undefined)
  assert.equal(def.source, "switch")
  assert.equal(def.toggleRole, "admin")
  assert.equal(def.area, "finance")
  assert.equal(def.clientVisible, false)
  assert.equal(def.owner, "Luke")
  assert.equal("requires" in def, false)
  // B56fix: the admin page says not to turn it on before V48 (no hard block exists for that).
  assert.match(def.description, /^Do not turn on until V48 \(keep as a carry\) is built\. /)
  try {
    setFeatureRowReaderForTests(async () => new Map())
    assert.equal(await isFeatureOn(key, {}), false)
    setFeatureRowReaderForTests(async () => new Map([[key, row(key, true)]]))
    assert.equal(await isFeatureOn(key, {}), true)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("S15: export_sheet_visibility, aa_client_pays_lines and billing_partner_pack_job are off by default, server-only admin switches, no env, no marker", async () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>
  }
  const cron = vercel.crons.find((c) => c.path === "/api/cron/billing-partner-pack")
  assert.equal(cron?.schedule, "0 6 17 * *", "06:00 UTC on the 17th: if this changes, fix the wording below")
  for (const [key, area] of [
    ["export_sheet_visibility", "reporting"],
    ["aa_client_pays_lines", "reporting"],
    ["billing_partner_pack_job", "finance"],
  ] as const) {
    const def = featureDefinition(key)!
    assert.ok(def, key)
    assert.equal(def.defaultOn, false)
    assert.equal(def.envName, undefined)
    assert.equal(def.source, "switch")
    assert.equal(def.toggleRole, "admin")
    assert.equal(def.area, area)
    assert.equal(def.clientVisible, false)
    assert.equal(def.requires, undefined)
    assert.equal(def.requiresMarker, undefined)
    try {
      setFeatureRowReaderForTests(async () => new Map())
      assert.equal(await isFeatureOn(key, {}), false, `${key} no row`)
      setFeatureRowReaderForTests(async () => new Map([[key, row(key, true)]]))
      assert.equal(await isFeatureOn(key, {}), true, `${key} a row on`)
    } finally {
      setFeatureRowReaderForTests(null)
    }
  }
  assert.match(featureDefinition("billing_partner_pack_job")!.description, /17:00 AEDT \(16:00 AEST\)/)
  assert.match(featureDefinition("billing_partner_pack_job")!.description, /never emails AA/)
})
