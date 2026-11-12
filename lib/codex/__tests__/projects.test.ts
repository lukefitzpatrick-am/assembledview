/** Codex projects and sections: pure rules (S1, B38). */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canSeeProject,
  checkDeleteSection,
  checkRecategorise,
  checkReorder,
  firstDoneSection,
  initialSectionDrafts,
  isCivilYmd,
  isProjectOwner,
  parseCreateProjectInput,
  parseCreateSectionInput,
  parseId,
  parseMoveTaskInput,
  parseReorderInput,
  parseUpdateProjectInput,
  parseUpdateSectionInput,
  planCompleteInProject,
  planSectionMove,
  statusForSectionCategory,
  suggestSectionCategory,
  touchesProjectAccess,
} from "../projects.js"

test("suggestSectionCategory: plan 5.2 names, whole words, any case, else to do", () => {
  const cases: Array<[string, string]> = [
    ["Done", "done"],
    ["DONE ✅", "done"],
    ["Finished", "done"],
    ["Awaiting", "waiting"],
    ["Awaiting client", "waiting"],
    ["Support needed", "waiting"],
    ["support-needed", "waiting"],
    ["In Progress", "in_progress"],
    ["in progress (SEO)", "in_progress"],
    ["Today", "in_progress"],
    ["This Week", "in_progress"],
    ["Backlog", "todo"],
    ["To do", "todo"],
    ["Undone ideas", "todo"],
    ["Weekly", "todo"],
    ["", "todo"],
  ]
  for (const [name, want] of cases) assert.equal(suggestSectionCategory(name), want, name)
})

test("statusForSectionCategory maps each category to the same Codex status", () => {
  assert.equal(statusForSectionCategory("todo"), "todo")
  assert.equal(statusForSectionCategory("in_progress"), "in_progress")
  assert.equal(statusForSectionCategory("waiting"), "waiting")
  assert.equal(statusForSectionCategory("done"), "done")
})

test("initialSectionDrafts: defaults, keeps order, appends Done when none is done", () => {
  assert.deepEqual(
    initialSectionDrafts(undefined).map((d) => d.status_category),
    ["todo", "in_progress", "done"]
  )
  assert.deepEqual(initialSectionDrafts([]).length, 3)
  const given = initialSectionDrafts([
    { name: "Inbox", status_category: "todo" },
    { name: "Doing", status_category: "in_progress" },
  ])
  assert.deepEqual(given.map((d) => d.name), ["Inbox", "Doing", "Done"])
  const hasDone = initialSectionDrafts([{ name: "Shipped", status_category: "done" }])
  assert.deepEqual(hasDone.map((d) => d.name), ["Shipped"])
})

const SECTIONS = [
  { id: 11, project_id: 1, sort_order: 2, status_category: "done" as const },
  { id: 10, project_id: 1, sort_order: 0, status_category: "todo" as const },
  { id: 12, project_id: 1, sort_order: 1, status_category: "done" as const },
  { id: 13, project_id: 1, sort_order: 1, status_category: "waiting" as const },
]

test("firstDoneSection: lowest sort_order, then lowest id", () => {
  assert.equal(firstDoneSection(SECTIONS)?.id, 12)
  assert.equal(firstDoneSection([SECTIONS[1]]), null)
  assert.equal(
    firstDoneSection([
      { id: 9, sort_order: 4, status_category: "done" },
      { id: 8, sort_order: 4, status_category: "done" },
    ])?.id,
    8
  )
})

test("checkRecategorise: the last done section cannot stop being done", () => {
  const one = [
    { id: 1, status_category: "todo" as const },
    { id: 2, status_category: "done" as const },
  ]
  assert.deepEqual(checkRecategorise(one, 2, "waiting"), {
    ok: false,
    reason: "last_done_section",
    message: "A project needs at least one done section. Add another done section first.",
  })
  assert.deepEqual(checkRecategorise(one, 2, "done"), { ok: true })
  assert.deepEqual(checkRecategorise(one, 1, "in_progress"), { ok: true })
  assert.deepEqual(checkRecategorise(SECTIONS, 11, "todo"), { ok: true }, "another done section remains")
})

test("checkDeleteSection: empty only, and never the last done section", () => {
  const one = [
    { id: 1, status_category: "todo" as const },
    { id: 2, status_category: "done" as const },
  ]
  const notEmpty = checkDeleteSection(one, 1, 3)
  assert.equal(notEmpty.ok, false)
  assert.equal(!notEmpty.ok && notEmpty.reason, "section_not_empty")
  assert.match(!notEmpty.ok ? notEmpty.message : "", /3 tasks/)
  const single = checkDeleteSection(one, 1, 1)
  assert.match(!single.ok ? single.message : "", /the 1 task out/)
  assert.deepEqual(checkDeleteSection(one, 1, 0), { ok: true })
  const lastDone = checkDeleteSection(one, 2, 0)
  assert.equal(!lastDone.ok && lastDone.reason, "last_done_section")
  assert.deepEqual(checkDeleteSection(SECTIONS, 12, 0), { ok: true })
})

test("checkReorder: a permutation of every section, nothing else", () => {
  assert.equal(checkReorder([1, 2, 3], [3, 1, 2]), true)
  assert.equal(checkReorder([1, 2, 3], [3, 1]), false, "missing one")
  assert.equal(checkReorder([1, 2, 3], [3, 1, 1]), false, "duplicate")
  assert.equal(checkReorder([1, 2, 3], [3, 1, 4]), false, "foreign id")
  assert.equal(checkReorder([1, 2], [2, 1, 3]), false, "extra")
})

test("planSectionMove: takes the section's category as status; joins from no project; refuses another project", () => {
  const done = { id: 12, project_id: 1, status_category: "done" as const }
  assert.deepEqual(planSectionMove({ project_id: null, section_id: null, status: "todo" }, done), {
    ok: true,
    status: "done",
    statusChanges: true,
    project_id: 1,
    section_id: 12,
  })
  const same = planSectionMove({ project_id: 1, section_id: 12, status: "done" }, done)
  assert.equal(same.ok && same.statusChanges, false)
  const backlog = planSectionMove(
    { project_id: 1, section_id: 12, status: "backlog" },
    { id: 10, project_id: 1, status_category: "todo" }
  )
  assert.equal(backlog.ok && backlog.status, "todo")
  const other = planSectionMove({ project_id: 2, section_id: 99, status: "todo" }, done)
  assert.equal(!other.ok && other.reason, "other_project")
})

test("planCompleteInProject: moves to the first done section; none is refused", () => {
  const plan = planCompleteInProject({ project_id: 1, section_id: 10, status: "in_progress" }, SECTIONS)
  assert.equal(plan.ok && plan.section_id, 12)
  assert.equal(plan.ok && plan.status, "done")
  const none = planCompleteInProject({ project_id: 1, section_id: 10, status: "todo" }, [SECTIONS[1]])
  assert.equal(!none.ok && none.reason, "no_done_section")
})

test("visibility: public to all staff; private to owner, creator and members only", () => {
  const priv = { is_private: true, owner_email: "Owner@X.au", created_by_email: "maker@x.au", members: ["Member@x.au"] }
  assert.equal(canSeeProject(priv, "owner@x.au"), true)
  assert.equal(canSeeProject(priv, " MAKER@x.au "), true)
  assert.equal(canSeeProject(priv, "member@x.au"), true)
  assert.equal(canSeeProject(priv, "someone@x.au"), false)
  assert.equal(canSeeProject(priv, ""), false)
  assert.equal(canSeeProject({ ...priv, is_private: false }, "someone@x.au"), true)
  assert.equal(isProjectOwner(priv, "member@x.au"), false)
  assert.equal(isProjectOwner(priv, "maker@x.au"), true)
  assert.equal(isProjectOwner({ ...priv, owner_email: null }, "owner@x.au"), false)
  assert.equal(isProjectOwner(priv, ""), false)
})

test("parseCreateProjectInput: required name and kind; optional fields normalised", () => {
  assert.equal(parseCreateProjectInput(null).ok, false)
  assert.equal(parseCreateProjectInput([]).ok, false)
  const noName = parseCreateProjectInput({ kind: "campaign" })
  assert.equal(!noName.ok && noName.error, "invalid_name")
  const badKind = parseCreateProjectInput({ name: "Sinch", kind: "client" })
  assert.equal(!badKind.ok && badKind.error, "invalid_kind")
  const ok = parseCreateProjectInput({
    name: "  Sinch   Engage ",
    kind: "campaign",
    mba_number: " sinch001 ",
    client_id: "42",
    owner_email: " Sam@Assembledmedia.com.au ",
    is_private: true,
    start_on: "2026-12-07",
    due_on: "2027-01-18",
    members: ["A@x.au", "a@x.au", "b@x.au"],
    sections: ["Backlog", { name: "Awaiting client" }, { name: "Shipped", status_category: "done" }],
  })
  assert.ok(ok.ok)
  assert.equal(ok.value.name, "Sinch Engage")
  assert.equal(ok.value.mba_number, "sinch001")
  assert.equal(ok.value.client_id, 42)
  assert.equal(ok.value.owner_email, "sam@assembledmedia.com.au")
  assert.equal(ok.value.is_private, true)
  assert.deepEqual(ok.value.members, ["a@x.au", "b@x.au"])
  assert.deepEqual(
    ok.value.sections?.map((s) => s.status_category),
    ["todo", "waiting", "done"]
  )
  const minimal = parseCreateProjectInput({ name: "SEO Management", kind: "retainer" })
  assert.ok(minimal.ok)
  assert.equal(minimal.value.is_private, false)
  assert.equal(minimal.value.sections, undefined)
  assert.equal(minimal.value.owner_email, null)
})

test("parseCreateProjectInput: rejects bad values", () => {
  const base = { name: "P", kind: "ops" }
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ client_id: 0 }, "invalid_client_id"],
    [{ client_id: "x" }, "invalid_client_id"],
    [{ mba_number: "two words" }, "invalid_mba_number"],
    [{ mba_number: 5 }, "invalid_mba_number"],
    [{ owner_email: "nobody" }, "invalid_owner_email"],
    [{ is_private: "yes" }, "invalid_is_private"],
    [{ start_on: "2026-02-30" }, "invalid_start_on"],
    [{ due_on: "13/11/2026" }, "invalid_due_on"],
    [{ start_on: "2026-12-10", due_on: "2026-12-01" }, "invalid_due_on"],
    [{ members: "a@x.au" }, "invalid_members"],
    [{ members: ["not-an-email"] }, "invalid_members"],
    [{ sections: "Done" }, "invalid_sections"],
    [{ sections: [{ name: "" }] }, "invalid_section_name"],
    [{ sections: [{ name: "X", status_category: "closed" }] }, "invalid_status_category"],
    [{ sections: Array.from({ length: 50 }, (_, i) => `S${i}`) }, "invalid_sections"],
    [{ name: "x".repeat(201) }, "invalid_name"],
  ]
  for (const [extra, error] of cases) {
    const r = parseCreateProjectInput({ ...base, ...extra })
    assert.equal(!r.ok && r.error, error, JSON.stringify(extra))
  }
  const many = parseCreateProjectInput({ ...base, members: Array.from({ length: 101 }, (_, i) => `p${i}@x.au`) })
  assert.equal(!many.ok && many.error, "invalid_members")
})

test("parseUpdateProjectInput: name, status, is_private, owner_email; access changes flagged", () => {
  const empty = parseUpdateProjectInput({})
  assert.equal(!empty.ok && empty.error, "nothing_to_update")
  const bad = parseUpdateProjectInput({ status: "archived" })
  assert.equal(!bad.ok && bad.error, "invalid_status")
  const rename = parseUpdateProjectInput({ name: " New " , status: "on_hold" })
  assert.ok(rename.ok)
  assert.deepEqual(rename.value, { name: "New", status: "on_hold" })
  assert.equal(touchesProjectAccess(rename.value), false)
  const priv = parseUpdateProjectInput({ is_private: true })
  assert.ok(priv.ok && touchesProjectAccess(priv.value))
  const owner = parseUpdateProjectInput({ owner_email: null })
  assert.ok(owner.ok && touchesProjectAccess(owner.value))
  assert.deepEqual(owner.ok && owner.value, { owner_email: null })
  assert.equal(parseUpdateProjectInput({ is_private: 1 }).ok, false)
})

test("section inputs: create suggests the category; update needs one field", () => {
  const created = parseCreateSectionInput({ name: "Support needed" })
  assert.ok(created.ok)
  assert.deepEqual(created.value, { name: "Support needed", status_category: "waiting", collapsed_default: false })
  const chosen = parseCreateSectionInput({ name: "Done-ish", status_category: "todo", collapsed_default: true })
  assert.ok(chosen.ok && chosen.value.status_category === "todo" && chosen.value.collapsed_default)
  assert.equal(parseCreateSectionInput({ name: "X", collapsed_default: "no" }).ok, false)
  assert.equal(parseUpdateSectionInput({}).ok, false)
  assert.equal(parseUpdateSectionInput({ status_category: "closed" }).ok, false)
  assert.deepEqual(parseUpdateSectionInput({ collapsed_default: true }), { ok: true, value: { collapsed_default: true } })
})

test("ids, reorder and move inputs", () => {
  assert.equal(parseId("12"), 12)
  assert.equal(parseId(12), 12)
  for (const bad of ["0", "-1", "1.5", "01", "x", "", 0, 1.5, null, "99999999999999999"]) {
    assert.equal(parseId(bad), null, String(bad))
  }
  assert.deepEqual(parseReorderInput({ ordered_ids: [3, "1", 2] }), { ok: true, value: [3, 1, 2] })
  assert.equal(parseReorderInput({ ordered_ids: [] }).ok, false)
  assert.equal(parseReorderInput({ ordered_ids: [1, "x"] }).ok, false)
  assert.deepEqual(parseMoveTaskInput({ task_id: "7" }), { ok: true, value: { task_id: 7, sort_order: null } })
  assert.deepEqual(parseMoveTaskInput({ task_id: 7, sort_order: 0 }), { ok: true, value: { task_id: 7, sort_order: 0 } })
  assert.equal(parseMoveTaskInput({ task_id: 7, sort_order: -1 }).ok, false)
  assert.equal(parseMoveTaskInput({ task_id: 7, sort_order: 1.5 }).ok, false)
  assert.equal(parseMoveTaskInput({ task_id: 7, sort_order: 2147483648 }).ok, false)
  assert.equal(parseMoveTaskInput({}).ok, false)
})

test("isCivilYmd: real dates only", () => {
  assert.equal(isCivilYmd("2028-02-29"), true)
  assert.equal(isCivilYmd("2027-02-29"), false)
  assert.equal(isCivilYmd("2026-13-01"), false)
  assert.equal(isCivilYmd("2026-1-01"), false)
})
