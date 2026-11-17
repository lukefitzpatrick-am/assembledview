/**
 * B48 (S28 A prep): a switch that names a migration marker reads off until
 * the marker exists, and can't be turned on before it. Its dependants follow.
 * lib/db/markers is the one marker reader, cached per instance.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { isMarkerApplied, MARKER_RECHECK_MS, setMarkerReaderForTests } from "@/lib/db/markers"
import { buildFeaturePageModel } from "@/lib/features/pageModel"
import { effectiveFeatureOn, FEATURE_MARKERS, featureDefinition, featureToggleRefusal, type FeatureRow } from "@/lib/features/registry"
import { isFeatureOn, readClientFeatureSnapshot, setFeatureRowReaderForTests } from "@/lib/features/server"

const row = (key: string): FeatureRow => ({ key, enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null })
const ALL_ON = ["codex_v2", "codex_projects", "codex_notifications", "codex_my_work", "codex_progress_field", "codex_saved_views"]

test("the Codex 0117 and 0118 switches name their markers; every marker key is a migration key", () => {
  assert.equal(featureDefinition("codex_projects")?.requiresMarker, "0118_codex_s1_projects")
  assert.equal(featureDefinition("codex_saved_views")?.requiresMarker, "0117_codex_saved_views")
  for (const m of FEATURE_MARKERS) assert.match(m, /^\d{4}_[a-z0-9_]+$/)
})

test("a missing marker: the switch and its dependants read off on the server and in the snapshot", async () => {
  try {
    setFeatureRowReaderForTests(async () => new Map(ALL_ON.map((k) => [k, row(k)])), ["0117_codex_saved_views"])
    for (const key of ["codex_projects", "codex_notifications", "codex_my_work", "codex_progress_field"] as const) {
      assert.equal(await isFeatureOn(key, {}), false, key)
    }
    assert.equal(await isFeatureOn("codex_saved_views", {}), true)
    assert.equal(await isFeatureOn("codex_v2", {}), true)
    const snapshot = await readClientFeatureSnapshot({})
    assert.equal(snapshot.codex_projects, false)
    assert.equal(snapshot.codex_notifications, false)
    assert.equal(snapshot.codex_saved_views, true)
    setFeatureRowReaderForTests(async () => new Map(ALL_ON.map((k) => [k, row(k)])))
    assert.equal(await isFeatureOn("codex_notifications", {}), true, "with every marker in place")
  } finally {
    setFeatureRowReaderForTests(null)
  }
})

test("turning on is refused until the marker exists; the page says so", () => {
  const raw = (k: string) => k === "codex_v2"
  const none = () => false
  assert.equal(
    featureToggleRefusal("codex_projects", true, raw, (k) => effectiveFeatureOn(k, raw, none), none),
    "Run migration 0118_codex_s1_projects first: this switch needs it.",
  )
  assert.equal(featureToggleRefusal("codex_projects", true, raw, (k) => effectiveFeatureOn(k, raw, () => true), () => true), null)
  const page = (markers: string[]) =>
    buildFeaturePageModel({
      ready: true,
      states: [{ key: "codex_v2", enabled: true, source: "switch", row: null }],
      roles: { admin: true, financeAdmin: true },
      markers,
    })
      .flatMap((g) => g.rows)
      .find((r) => r.key === "codex_projects")!
  assert.equal(page([]).canToggle, false)
  assert.equal(page([]).hint, "Run migration 0118_codex_s1_projects first: this switch needs it.")
  assert.equal(page(["0118_codex_s1_projects"]).canToggle, true)
})

test("a switch saved on before its migration: the page says it reads off, and its dependants name the migration, not Turn on (V14)", () => {
  const states = ["codex_v2", "codex_projects", "codex_notifications"].map((key) => ({ key, enabled: true, source: "switch" as const, row: null }))
  const rows = (markers: string[], extra: typeof states = []) =>
    new Map(
      buildFeaturePageModel({ ready: true, states: [...states, ...extra], roles: { admin: true, financeAdmin: true }, markers })
        .flatMap((g) => g.rows)
        .map((r) => [r.key, r]),
    )
  const before = rows([])
  assert.equal(before.get("codex_projects")!.enabled, true)
  assert.equal(
    before.get("codex_projects")!.hint,
    "Reads off until migration 0118_codex_s1_projects runs. Turn off Tasks: notifications first: it needs this switch.",
  )
  const why = "Tasks: projects and sections reads off until migration 0118_codex_s1_projects runs: this switch needs it."
  assert.equal(before.get("codex_notifications")!.hint, why, "an on dependant")
  assert.equal(before.get("codex_my_work")!.hint, why, "an off dependant: turning it on is refused with the reason")
  assert.equal(before.get("codex_my_work")!.canToggle, false)
  const raw = (k: string) => states.some((s) => s.key === k)
  assert.equal(featureToggleRefusal("codex_my_work", true, raw, (k) => effectiveFeatureOn(k, raw, () => false), () => false), why, "the API says the same")
  const after = rows(["0118_codex_s1_projects", "0117_codex_saved_views"])
  assert.equal(after.get("codex_projects")!.hint, "Turn off Tasks: notifications first: it needs this switch.", "no migration note once it ran")
  assert.equal(after.get("codex_notifications")!.hint, null)
  assert.equal(after.get("codex_my_work")!.canToggle, true)
  // Two levels down: on, its requirement on, that one's marker missing.
  const nested = rows([], [{ key: "codex_my_work", enabled: true, source: "switch", row: null }])
  assert.equal(nested.get("codex_my_work")!.hint, why)
  // A requirement saved off keeps the old wording.
  const v2Off = (k: string) => k !== "codex_v2" && raw(k)
  assert.equal(featureToggleRefusal("codex_projects", true, v2Off, () => false, () => true), "Turn on Tasks (Codex) first: this switch needs it.")
})

test("lib/db/markers: an applied marker is kept; a missing one is read again after the recheck; a failed read is not cached", async () => {
  const asked: string[] = []
  let present = new Set<string>()
  let fail = false
  setMarkerReaderForTests(async (key) => {
    asked.push(key)
    if (fail) throw new Error("db down")
    return present.has(key)
  })
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.equal(await isMarkerApplied("0118_codex_s1_projects"), false)
    assert.equal(await isMarkerApplied("0118_codex_s1_projects"), false)
    assert.equal(asked.length, 1, "a missing marker is not read again inside the recheck window")
    assert.equal(MARKER_RECHECK_MS, 60_000)
    present = new Set(["0117_codex_saved_views"])
    fail = true
    assert.equal(await isMarkerApplied("0117_codex_saved_views"), false, "a failed read is not applied")
    fail = false
    assert.equal(await isMarkerApplied("0117_codex_saved_views"), true, "and not cached")
    present = new Set()
    assert.equal(await isMarkerApplied("0117_codex_saved_views"), true, "applied stays applied")
    assert.deepEqual(asked, ["0118_codex_s1_projects", "0117_codex_saved_views", "0117_codex_saved_views"])
  } finally {
    console.warn = warn
    setMarkerReaderForTests(null)
  }
})

test("lib/db/markers: a missing marker is read again once MARKER_RECHECK_MS has passed (RELFIX1, B48 R3)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-17T00:00:00Z") })
  let present = false
  let reads = 0
  setMarkerReaderForTests(async () => {
    reads += 1
    return present
  })
  try {
    assert.equal(await isMarkerApplied("0118_codex_s1_projects"), false)
    present = true // Luke runs the migration
    t.mock.timers.tick(MARKER_RECHECK_MS - 1)
    assert.equal(await isMarkerApplied("0118_codex_s1_projects"), false, "inside the window: the cached answer")
    assert.equal(reads, 1)
    t.mock.timers.tick(1)
    assert.equal(await isMarkerApplied("0118_codex_s1_projects"), true, "after the window: read again")
    assert.equal(reads, 2)
  } finally {
    setMarkerReaderForTests(null)
  }
})
