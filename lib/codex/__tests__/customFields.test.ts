/**
 * Codex custom fields (B40): pure rules for field definitions, option ids,
 * values and card chips.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  applyCustomValuesPatch,
  checkDeleteField,
  checkFieldCount,
  FIELDS_PER_PROJECT_MAX,
  nextOptionNumber,
  OPTIONS_PER_FIELD_MAX,
  parseCardFieldsInput,
  parseCreateFieldInput,
  parseCustomValuesPatch,
  parseUpdateFieldInput,
  planFieldUpdate,
  readRemovedOptions,
  readStoredOptions,
  readStoredValues,
  valueLabels,
  visibleCardFields,
  type CodexCustomField,
} from "../customFields.js"

const progress: CodexCustomField = {
  id: 7,
  project_id: 1,
  name: "Progress",
  field_type: "single_select",
  options: [
    { id: "o1", label: "Not started" },
    { id: "o2", label: "In progress" },
    { id: "o3", label: "Done" },
  ],
  done_option: "o3",
}

const tags: CodexCustomField = {
  id: 8,
  project_id: 1,
  name: "Tags",
  field_type: "multi_select",
  options: [
    { id: "o1", label: "Meta" },
    { id: "o2", label: "Search" },
    { id: "o5", label: "TikTok" },
  ],
  done_option: null,
}

test("create: names and options trimmed, ids o1..on in order, done option by label (single-select only)", () => {
  const r = parseCreateFieldInput({ name: "  Task  progress ", field_type: "single_select", options: [" Not started", "Done "], done_option: "done" })
  assert.ok(r.ok)
  assert.equal(r.value.name, "Task progress")
  assert.deepEqual(r.value.options, [{ id: "o1", label: "Not started" }, { id: "o2", label: "Done" }])
  assert.equal(r.value.done_option, "o2")
  const multi = parseCreateFieldInput({ name: "Tags", field_type: "multi_select", options: ["a"], done_option: "a" })
  assert.equal(!multi.ok && multi.error, "invalid_done_option")
  const missing = parseCreateFieldInput({ name: "P", field_type: "single_select", options: ["a"], done_option: "b" })
  assert.equal(!missing.ok && missing.error, "invalid_done_option")
})

test("create refuses: no name, text and date types (not built), no options, duplicate labels any case, too many options", () => {
  const cases: Array<[unknown, string]> = [
    [{ field_type: "single_select", options: ["a"] }, "invalid_name"],
    [{ name: "x", field_type: "text", options: ["a"] }, "invalid_field_type"],
    [{ name: "x", field_type: "date", options: ["a"] }, "invalid_field_type"],
    [{ name: "x", field_type: "single_select", options: [] }, "invalid_options"],
    [{ name: "x", field_type: "single_select", options: ["Done", "done"] }, "invalid_options"],
    [{ name: "x", field_type: "single_select", options: ["a", " "] }, "invalid_options"],
    [{ name: "x", field_type: "single_select", options: Array.from({ length: OPTIONS_PER_FIELD_MAX + 1 }, (_, i) => `o${i}`) }, "invalid_options"],
    [[], "invalid_body"],
  ]
  for (const [body, error] of cases) {
    const r = parseCreateFieldInput(body)
    assert.equal(!r.ok && r.error, error, JSON.stringify(body))
  }
})

test("update parse: the type never changes; options carry ids or are new; done option is an id or null", () => {
  assert.equal((parseUpdateFieldInput({ field_type: "multi_select" }) as { error: string }).error, "invalid_field_type")
  assert.equal((parseUpdateFieldInput({}) as { error: string }).error, "nothing_to_update")
  const r = parseUpdateFieldInput({ options: [{ id: "o2", label: "Doing" }, "Blocked"], done_option: null })
  assert.ok(r.ok)
  assert.deepEqual(r.value.options, [{ id: "o2", label: "Doing" }, { id: null, label: "Blocked" }])
  assert.equal(r.value.done_option, null)
  assert.equal((parseUpdateFieldInput({ options: [{ id: "o1", label: "a" }, { id: "o1", label: "b" }] }) as { error: string }).error, "invalid_options")
  assert.equal((parseUpdateFieldInput({ options: [{ id: "x9", label: "a" }] }) as { error: string }).error, "invalid_options")
  assert.equal((parseUpdateFieldInput({ done_option: 3 }) as { error: string }).error, "invalid_done_option")
})

test("update plan: rename and reorder keep option ids; new options take the next unused id", () => {
  const r = planFieldUpdate(
    tags,
    { name: "Channels", options: [{ id: "o5", label: "TikTok" }, { id: "o1", label: "Meta ads" }, { id: null, label: "Reddit" }, { id: "o2", label: "Search" }] },
    {}
  )
  assert.ok(r.ok)
  assert.equal(r.field.name, "Channels")
  assert.deepEqual(r.field.options, [
    { id: "o5", label: "TikTok" },
    { id: "o1", label: "Meta ads" },
    { id: "o6", label: "Reddit" },
    { id: "o2", label: "Search" },
  ])
  assert.equal(nextOptionNumber(["o1", "o12", "x"]), 13)
})

test("update plan: removing an option a live task uses is refused; unused is removed; the done option follows", () => {
  const inUse = planFieldUpdate(progress, { options: [{ id: "o1", label: "Not started" }, { id: "o3", label: "Done" }] }, { o2: 2 })
  assert.equal(!inUse.ok && inUse.reason, "option_in_use")
  assert.match(!inUse.ok ? inUse.message : "", /2 tasks use "In progress"/)
  const removeDone = planFieldUpdate(progress, { options: [{ id: "o1", label: "Not started" }, { id: "o2", label: "In progress" }] }, { o2: 2 })
  assert.ok(removeDone.ok)
  assert.equal(removeDone.field.done_option, null, "a removed done option clears it")
  const stranger = planFieldUpdate(progress, { options: [{ id: "o9", label: "x" }] }, {})
  assert.equal(!stranger.ok && stranger.reason, "unknown_option")
})

test("B40fix (F5): option ids are never reused: remove, save, add takes a new number; a removed id never comes back", () => {
  // Remove the top option o3 (unused), save.
  const removed = planFieldUpdate(progress, { options: [{ id: "o1", label: "Not started" }, { id: "o2", label: "In progress" }] }, {})
  assert.ok(removed.ok)
  assert.deepEqual(removed.stored, [
    { id: "o1", label: "Not started" },
    { id: "o2", label: "In progress" },
    { id: "o3", label: "Done", removed: true },
  ], "the removed option is kept, marked removed")
  // Read back as the store does, then add "D".
  const field = { ...removed.field, options: readStoredOptions(removed.stored) }
  assert.deepEqual(field.options.map((o) => o.id), ["o1", "o2"], "readers see live options only")
  assert.deepEqual(readRemovedOptions(removed.stored), [{ id: "o3", label: "Done" }])
  const added = planFieldUpdate(field, { options: [...field.options, { id: null, label: "D" }] }, {}, readRemovedOptions(removed.stored))
  assert.ok(added.ok)
  assert.deepEqual(added.field.options.at(-1), { id: "o4", label: "D" }, "D is o4, never o3")
  assert.deepEqual(added.stored.at(-1), { id: "o3", label: "Done", removed: true }, "the removed entry is kept on later saves")
  assert.equal(added.stored.filter((o) => o.id === "o3").length, 1)
  // A stale screen sending the removed id back is refused.
  const stale = planFieldUpdate(field, { options: [{ id: "o3", label: "Done" }] }, {}, readRemovedOptions(removed.stored))
  assert.equal(!stale.ok && stale.reason, "unknown_option")
  // A rename-only save keeps the removed entries too.
  const renamed = planFieldUpdate(added.field, { name: "Stage" }, {}, readRemovedOptions(added.stored))
  assert.ok(renamed.ok)
  assert.deepEqual(renamed.stored.filter((o) => o.removed).map((o) => o.id), ["o3"])
  // Two removals across saves both stay reserved.
  const again = planFieldUpdate(added.field, { options: [{ id: "o1", label: "Not started" }] }, {}, readRemovedOptions(added.stored))
  assert.ok(again.ok)
  assert.deepEqual(readRemovedOptions(again.stored).map((o) => o.id).sort(), ["o2", "o3", "o4"])
  const next = planFieldUpdate(again.field, { options: [{ id: "o1", label: "Not started" }, { id: null, label: "E" }] }, {}, readRemovedOptions(again.stored))
  assert.ok(next.ok)
  assert.equal(next.field.options[1].id, "o5")
})

test("update plan: done option must be an option, and only on a single-select", () => {
  const ok = planFieldUpdate(progress, { done_option: "o2" }, {})
  assert.ok(ok.ok)
  assert.equal(ok.field.done_option, "o2")
  const bad = planFieldUpdate(progress, { done_option: "o9" }, {})
  assert.equal(!bad.ok && bad.reason, "invalid_done_option")
  const multi = planFieldUpdate(tags, { done_option: "o1" }, {})
  assert.equal(!multi.ok && multi.reason, "invalid_done_option")
})

test("delete: refused while any live task has a value; field count capped", () => {
  assert.equal((checkDeleteField(1) as { reason: string }).reason, "field_has_values")
  assert.deepEqual(checkDeleteField(0), { ok: true })
  assert.deepEqual(checkFieldCount(FIELDS_PER_PROJECT_MAX - 1), { ok: true })
  assert.equal((checkFieldCount(FIELDS_PER_PROJECT_MAX) as { reason: string }).reason, "too_many_fields")
})

test("values: patch shape is field id to option id, list or null", () => {
  assert.ok(parseCustomValuesPatch({ "7": "o1", "8": ["o1"], "9": null }).ok)
  for (const bad of [null, [], {}, { x: "o1" }, { "0": "o1" }, { "7": 3 }, { "7": [1] }]) {
    assert.equal(parseCustomValuesPatch(bad).ok, false, JSON.stringify(bad))
  }
})

test("values: validated against the project's fields and options; null or [] clears", () => {
  const fields = [progress, tags]
  const r = applyCustomValuesPatch({ "7": "o1" }, { "7": "o3", "8": ["o5", "o1"] }, fields)
  assert.ok(r.ok)
  assert.deepEqual(r.values, { "7": "o3", "8": ["o5", "o1"] })
  const cleared = applyCustomValuesPatch(r.ok ? r.values : {}, { "7": null, "8": [] }, fields)
  assert.ok(cleared.ok)
  assert.deepEqual(cleared.values, {})
  assert.equal((applyCustomValuesPatch({}, { "99": "o1" }, fields) as { reason: string }).reason, "unknown_field")
  assert.equal((applyCustomValuesPatch({}, { "7": "o9" }, fields) as { reason: string }).reason, "invalid_value")
  assert.equal((applyCustomValuesPatch({}, { "7": ["o1"] }, fields) as { reason: string }).reason, "invalid_value", "single-select takes one id")
  assert.equal((applyCustomValuesPatch({}, { "8": ["o1", "o1"] }, fields) as { reason: string }).reason, "invalid_value")
  assert.equal((applyCustomValuesPatch({}, { "8": ["o3"] }, fields) as { reason: string }).reason, "invalid_value")
  const single = applyCustomValuesPatch({}, { "8": "o2" }, fields)
  assert.ok(single.ok)
  assert.deepEqual(single.values, { "8": ["o2"] }, "a multi-select stores a list")
})

test("stored jsonb is read defensively; labels follow option order for multi-select", () => {
  assert.deepEqual(readStoredOptions([{ id: "o1", label: "a" }, { id: "o1", label: "dup" }, { id: 2 }, "x"]), [{ id: "o1", label: "a" }])
  assert.deepEqual(readStoredValues({ "7": "o1", "8": ["o2"], "9": 3, "10": [1] }), { "7": "o1", "8": ["o2"] })
  assert.deepEqual(valueLabels(tags, { "8": ["o5", "o1"] }), ["Meta", "TikTok"])
  assert.deepEqual(valueLabels(progress, { "7": "o2" }), ["In progress"])
  assert.deepEqual(valueLabels(progress, { "7": "o9" }), [])
})

test("card chips: every field shows unless set to hide; input is { key, show } once each", () => {
  const r = parseCardFieldsInput({ card_fields: [{ key: "field:8", show: false }] })
  assert.ok(r.ok)
  assert.deepEqual(visibleCardFields([progress, tags], r.ok ? r.value : []).map((f) => f.id), [7])
  assert.deepEqual(visibleCardFields([progress, tags], []).map((f) => f.id), [7, 8])
  assert.equal(parseCardFieldsInput({ card_fields: [{ key: "title", show: true }] }).ok, false)
  assert.equal(parseCardFieldsInput({ card_fields: [{ key: "field:8", show: false }, { key: "field:8", show: true }] }).ok, false)
  assert.equal(parseCardFieldsInput({}).ok, false)
})

// ---------------------------------------------------------------------------
// B42: the progress field (plan 4.2)
// ---------------------------------------------------------------------------

test("progress rule: only a single-select with a live done option gives a rule", async () => {
  const { progressRuleFromField, checkProgressFieldLink } = await import("../customFields.js")
  const opts = [{ id: "o1", label: "To do" }, { id: "o2", label: "Done" }]
  assert.deepEqual(progressRuleFromField({ id: 4, field_type: "single_select", options: opts, done_option: "o2" }), { fieldId: 4, doneOption: "o2" })
  assert.equal(progressRuleFromField({ id: 4, field_type: "multi_select", options: opts, done_option: "o2" }), null)
  assert.equal(progressRuleFromField({ id: 4, field_type: "single_select", options: opts, done_option: null }), null)
  assert.equal(
    progressRuleFromField({ id: 4, field_type: "single_select", options: [opts[0], { ...opts[1], removed: true }], done_option: "o2" }),
    null,
    "a removed option never counts (B40fix keeps it in the jsonb)"
  )
  assert.equal(checkProgressFieldLink(null)?.reason, "progress_field_invalid")
  assert.equal(checkProgressFieldLink({ field_type: "multi_select", options: opts, done_option: "o2" })?.reason, "progress_field_invalid")
  assert.equal(checkProgressFieldLink({ field_type: "single_select", options: opts, done_option: null })?.reason, "progress_field_invalid")
  assert.equal(checkProgressFieldLink({ field_type: "single_select", options: opts, done_option: "o2" }), null)
})

test("progress rule: the done option completes; completing sets it once", async () => {
  const { valuesCompleteTask, valuesOnComplete } = await import("../customFields.js")
  const rule = { fieldId: 4, doneOption: "o2" }
  assert.equal(valuesCompleteTask(rule, { "4": "o2" }), true)
  assert.equal(valuesCompleteTask(rule, { "4": "o1" }), false)
  assert.equal(valuesCompleteTask(rule, { "5": "o2" }), false, "another field's same id")
  assert.equal(valuesCompleteTask(null, { "4": "o2" }), false)
  assert.deepEqual(valuesOnComplete(rule, { "5": ["a"] }), { "5": ["a"], "4": "o2" })
  assert.deepEqual(valuesOnComplete(rule, { "4": "o1" }), { "4": "o2" })
  assert.equal(valuesOnComplete(rule, { "4": "o2" }), null, "already set: nothing to write")
  assert.deepEqual(valuesOnComplete(rule, null), { "4": "o2" })
})

test("F7 (B42fix): progressPatchDecision: a status decides; disagreeing with the field sent is a conflict; only the field as sent completes", async () => {
  const { progressPatchDecision } = await import("../customFields.js")
  const rule = { fieldId: 4, doneOption: "o2" }
  const kind = (r: ReturnType<typeof progressPatchDecision>) => (r.kind === "conflict" ? r.reason : r.kind)
  assert.equal(kind(progressPatchDecision(rule, { "4": "o2" }, undefined, "todo")), "complete")
  assert.equal(kind(progressPatchDecision(rule, { "4": "o2" }, undefined, "done")), "none")
  assert.equal(kind(progressPatchDecision(rule, { "4": "o1" }, undefined, "todo")), "none")
  assert.equal(kind(progressPatchDecision(rule, { "5": "x" }, undefined, "todo")), "none", "another field: a stored done value does not count")
  assert.equal(kind(progressPatchDecision(rule, { "4": "o2" }, "todo", "todo")), "progress_conflict")
  // PACK3fix (review K16): every open status sent with the done option is a conflict, not only to do.
  for (const open of ["backlog", "in_progress", "waiting"]) {
    assert.equal(kind(progressPatchDecision(rule, { "4": "o2" }, open, "todo")), "progress_conflict", open)
    assert.equal(kind(progressPatchDecision(rule, { "4": "o2" }, open, "done")), "progress_conflict", `${open} from done`)
  }
  assert.equal(kind(progressPatchDecision(rule, { "4": "o1" }, "done", "todo")), "progress_conflict")
  assert.equal(kind(progressPatchDecision(rule, { "4": null }, "done", "todo")), "progress_conflict", "clearing it while completing")
  assert.equal(kind(progressPatchDecision(rule, { "4": "o2" }, "done", "todo")), "none")
  assert.equal(kind(progressPatchDecision(rule, { "4": "o1" }, "in_progress", "todo")), "none")
  assert.equal(kind(progressPatchDecision(rule, { "5": "x" }, "done", "todo")), "none", "completing while setting another field: no conflict")
  assert.equal(kind(progressPatchDecision(null, { "4": "o2" }, "todo", "todo")), "none", "no rule (switch off or no link)")
})
