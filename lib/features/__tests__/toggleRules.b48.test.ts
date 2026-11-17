/**
 * B48 (S16 A): a switch can't be turned on while a requirement is off, or
 * off while a switch that requires it is on. One rule
 * (`featureToggleRefusal`) for /admin/features and setFeatureSwitch.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildFeaturePageModel } from "@/lib/features/pageModel"
import { effectiveFeatureOn, featureToggleRefusal } from "@/lib/features/registry"

function rule(on: string[], markers: string[] = ["0117_codex_saved_views", "0118_codex_s1_projects"]) {
  const raw = (k: string) => on.includes(k)
  const applied = (m: string) => markers.includes(m)
  return (key: string, enabled: boolean) => featureToggleRefusal(key, enabled, raw, (k) => effectiveFeatureOn(k, raw, applied), applied)
}

test("on is refused while a requirement is off, naming it", () => {
  assert.equal(rule([])("true_up_actions", true), "Turn on True-up report first: this switch needs it.")
  assert.equal(rule(["true_up"])("true_up_actions", true), null)
  assert.equal(
    rule([])("fixed_cost_margin_from_date", true),
    "Turn on Fixed cost from a date and Fixed-cost report on net media first: this switch needs them.",
  )
  assert.equal(rule(["fixed_cost_report_net"])("fixed_cost_margin_from_date", true), "Turn on Fixed cost from a date first: this switch needs it.")
})

test("a requirement counts only when it is live: its own requirements are on too", () => {
  // codex_projects is on but codex_v2 is off, so codex_projects is not live.
  assert.equal(rule(["codex_projects"])("codex_my_work", true), "Turn on Tasks: projects and sections first: this switch needs it.")
  assert.equal(rule(["codex_v2", "codex_projects"])("codex_my_work", true), null)
})

test("off is refused while a switch that requires it is on, naming them", () => {
  assert.equal(rule(["true_up", "true_up_actions", "true_up_cron"])("true_up", false), "Turn off True-up fixes and Monthly true-up run first: they need this switch.")
  assert.equal(rule(["true_up", "true_up_cron"])("true_up", false), "Turn off Monthly true-up run first: it needs this switch.")
  assert.equal(rule(["true_up"])("true_up", false), null)
  // A dependant's own value counts, even when it is not live, so nothing is left on with its requirement off.
  assert.equal(rule(["codex_projects", "codex_notifications"])("codex_projects", false), "Turn off Tasks: notifications first: it needs this switch.")
})

test("switches with no requirement and no dependant are never refused", () => {
  for (const enabled of [true, false]) {
    assert.equal(rule([])("hub_delivered_dedupe", enabled), null)
    assert.equal(rule(["hub_delivered_dedupe"])("hub_delivered_dedupe", enabled), null)
  }
})

test("/admin/features disables a refused toggle and says why", () => {
  const state = (key: string, enabled: boolean) => ({ key, enabled, source: "switch" as const, row: null })
  const rows = buildFeaturePageModel({
    ready: true,
    states: [state("true_up", true), state("true_up_cron", true), state("codex_v2", false), state("codex_search", false)],
    roles: { admin: true, financeAdmin: true },
    markers: ["0117_codex_saved_views", "0118_codex_s1_projects"],
  }).flatMap((g) => g.rows)
  const trueUp = rows.find((r) => r.key === "true_up")!
  assert.equal(trueUp.canToggle, false)
  assert.equal(trueUp.hint, "Turn off Monthly true-up run first: it needs this switch.")
  const search = rows.find((r) => r.key === "codex_search")!
  assert.equal(search.canToggle, false)
  assert.equal(search.hint, "Turn on Tasks (Codex) first: this switch needs it.")
  const cron = rows.find((r) => r.key === "true_up_cron")!
  assert.equal(cron.canToggle, true)
  const actions = rows.find((r) => r.key === "true_up_actions")!
  assert.equal(actions.canToggle, true, "true_up is on, so its fixes can go on")
})
