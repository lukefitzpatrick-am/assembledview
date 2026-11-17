/**
 * B48 (S16 A): `isFeatureOn` and the browser snapshot resolve `requires`
 * transitively, so no getter or browser check repeats them. The table below
 * is the rule each deleted getter coded by hand before B48: for every switch
 * and every on/off combination of it and its requirements, the one function
 * gives the same answer, so nothing changes for any combination.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { effectiveFeatureOn, FEATURE_DEFINITIONS, featureDefinition, featureEnvValue, type FeatureRow } from "@/lib/features/registry"
import { isFeatureOn, readClientFeatureSnapshot, setFeatureRowReaderForTests } from "@/lib/features/server"
import { clientFeatureOn, setClientFeatureSnapshot } from "@/lib/features/client"

type On = Record<string, boolean>

/** The getters before B48 (lib/codex/flag.ts, trueUp/flag.ts, deliveryFlags combine*, fromDate combine, the folds). */
const BEFORE: Record<string, (on: On) => boolean> = {
  true_up_actions: (r) => r.true_up && r.true_up_actions,
  true_up_cron: (r) => r.true_up && r.true_up_cron,
  expert_package_quantity: (r) => r.expert_package_quantity && r.fixed_cost_report_net,
  fixed_cost_from_date: (r) => r.fixed_cost_from_date && r.fixed_cost_report_net,
  fixed_cost_margin_from_date: (r) => r.fixed_cost_margin_from_date && r.fixed_cost_from_date && r.fixed_cost_report_net,
  codex_roster_aliases: (r) => r.codex_v2 && r.codex_roster_aliases,
  codex_search: (r) => r.codex_v2 && r.codex_search,
  codex_saved_views: (r) => r.codex_v2 && r.codex_saved_views,
  codex_projects: (r) => r.codex_v2 && r.codex_projects,
  codex_contained_writes: (r) => r.codex_v2 && r.codex_contained_writes,
  codex_notifications: (r) => r.codex_v2 && r.codex_projects && r.codex_notifications,
  codex_progress_field: (r) => r.codex_v2 && r.codex_projects && r.codex_progress_field,
  codex_my_work: (r) => r.codex_v2 && r.codex_projects && r.codex_my_work,
  // B55: enforcing the policy needs the policy sent (S27).
  csp_enforce: (r) => r.security_headers && r.csp_enforce,
}

function closure(key: string, out = new Set<string>()): Set<string> {
  out.add(key)
  for (const k of featureDefinition(key)?.requires ?? []) closure(k, out)
  return out
}

function combinations(keys: string[]): On[] {
  return Array.from({ length: 2 ** keys.length }, (_, n) => Object.fromEntries(keys.map((k, i) => [k, ((n >> i) & 1) === 1])))
}

const row = (key: string, enabled: boolean): FeatureRow => ({ key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null })

const SWITCHES = FEATURE_DEFINITIONS.filter((d) => d.source === "switch")

test("every switch with requires has its old rule in the table (a new requires is a reviewed decision)", () => {
  const withRequires = FEATURE_DEFINITIONS.filter((d) => "requires" in d && d.requires?.length).map((d) => d.key)
  assert.deepEqual([...withRequires].sort(), Object.keys(BEFORE).sort())
})

test("requires has no loop and names only registry switches", () => {
  for (const def of FEATURE_DEFINITIONS) {
    const walk = (key: string, path: string[]) => {
      assert.ok(featureDefinition(key), `${def.key} requires unknown ${key}`)
      assert.ok(!path.includes(key), `loop: ${[...path, key].join(" > ")}`)
      for (const k of featureDefinition(key)?.requires ?? []) walk(k, [...path, key])
    }
    walk(def.key, [])
  }
})

for (const def of SWITCHES) {
  test(`${def.key}: isFeatureOn and the browser snapshot match the old rule for every combination`, async () => {
    const keys = [...closure(def.key)]
    const before = BEFORE[def.key] ?? ((r: On) => r[def.key])
    try {
      for (const on of combinations(keys)) {
        setFeatureRowReaderForTests(async () => new Map(keys.map((k) => [k, row(k, on[k])])))
        const label = JSON.stringify(on)
        assert.equal(await isFeatureOn(def.key, {}), before(on), label)
        assert.equal(effectiveFeatureOn(def.key, (k) => on[k] === true, () => true), before(on), label)
        if (def.clientVisible) {
          const snapshot = await readClientFeatureSnapshot({})
          assert.equal(snapshot[def.key as keyof typeof snapshot], before(on), `snapshot ${label}`)
          setClientFeatureSnapshot(snapshot)
          assert.equal(clientFeatureOn(def.key as keyof typeof snapshot), before(on), `browser ${label}`)
        }
      }
    } finally {
      setFeatureRowReaderForTests(null)
      setClientFeatureSnapshot(null)
    }
  })
}

test("a requirement read from its env var counts the same as a row (codex_v2 before its row exists)", async () => {
  try {
    setFeatureRowReaderForTests(async () => new Map([["codex_projects", row("codex_projects", true)]]))
    assert.equal(await isFeatureOn("codex_projects", { CODEX_V2: "on" }), true)
    assert.equal(await isFeatureOn("codex_projects", {}), false)
    assert.equal(await isFeatureOn("codex_notifications", { CODEX_V2: "on" }), false, "its own switch is still off")
  } finally {
    setFeatureRowReaderForTests(null)
  }
  assert.equal(featureEnvValue("true_up_actions", { TRUE_UP_ACTIONS: "on" }), false)
  assert.equal(featureEnvValue("true_up_actions", { TRUE_UP_ACTIONS: "on", TRUE_UP: "on" }), true)
})
