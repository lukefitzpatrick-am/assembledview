/**
 * B40 routes: the task detail's project part, subtasks, custom fields and
 * card chips. The full guard chain on every method (codex_v2 404,
 * codex_projects 404, session 401, staff 403, no email 401), 500 without
 * detail, store refusals mapped, bad ids 404 and bad
 * bodies 400 before the store. Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

let session: null | { user: { email?: string; roles: string[] } } = null
const calls: Array<{ fn: string; args: unknown[] }> = []
let mode = "ok"


const FIELD = { id: 3, project_id: 5, name: "Progress", field_type: "single_select", options: [{ id: "o1", label: "A" }], done_option: null }
const SUB = { id: 9, title: "Sub", status: "todo", assignee_email: null, assignee_name: null, start_on: null, due_on: null, sort_order: 0 }

function outcome<T>(okValue: T): T | { ok: false; reason: string; message: string } {
  if (mode === "boom") throw new Error("secret detail")
  if (mode !== "ok") return { ok: false, reason: mode, message: `m:${mode}` }
  return okValue
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/codex/assigneeWrite", {
    namedExports: {
      resolveAssigneeForWrite: async (email: string) =>
        email === "shared@x.au"
          ? { ok: false, status: 409, body: { error: "ambiguous_assignee" } }
          : { ok: true, email: email.toLowerCase(), name: "Mia", resolved: true },
    },
  })
  const fn = (name: string, value: () => unknown) => async (...args: unknown[]) => {
    calls.push({ fn: name, args })
    return value()
  }
  await mock.module!("@/lib/codex/taskDetailRepo", {
    namedExports: {
      getTaskProjectDetail: fn("getTaskProjectDetail", () =>
        outcome({ ok: true, task: { id: 7 }, project: null, project_hidden: false, sections: [], fields: [], subtasks: [SUB], parent: null })
      ),
      createSubtask: fn("createSubtask", () => outcome({ ok: true, subtask: SUB })),
      reorderSubtasks: fn("reorderSubtasks", () => outcome({ ok: true, subtasks: [SUB] })),
    },
  })
  await mock.module!("@/lib/codex/customFieldsRepo", {
    namedExports: {
      listProjectFields: fn("listProjectFields", () => outcome({ ok: true, fields: [FIELD], card_fields: [] })),
      createCustomField: fn("createCustomField", () => outcome({ ok: true, field: FIELD })),
      updateCustomField: fn("updateCustomField", () => outcome({ ok: true, field: FIELD })),
      deleteCustomField: fn("deleteCustomField", () => outcome({ ok: true })),
      setProjectCardFields: fn("setProjectCardFields", () => outcome({ ok: true, card_fields: [] })),
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withSwitches<T>(codex: boolean, projects: boolean, run: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", codex)],
        ["codex_projects", row("codex_projects", projects)],
      ])
  )
  try {
    return await run()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const T = "http://l/api/codex/tasks"
const P = "http://l/api/codex/projects"
const req = (method: string, url: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const ctx = <Q extends Record<string, string>>(p: Q) => ({ params: Promise.resolve(p) })
const STAFF = { user: { email: "Luke@X.au", roles: ["admin"] } }

type Call = { name: string; run: () => Promise<Response>; repo: string; okStatus: number }

async function routes(): Promise<Call[]> {
  const detail = await import("../../../app/api/codex/tasks/[id]/project/route.js")
  const subtasks = await import("../../../app/api/codex/tasks/[id]/subtasks/route.js")
  const reorder = await import("../../../app/api/codex/tasks/[id]/subtasks/reorder/route.js")
  const fields = await import("../../../app/api/codex/projects/[id]/fields/route.js")
  const field = await import("../../../app/api/codex/projects/[id]/fields/[fieldId]/route.js")
  const cards = await import("../../../app/api/codex/projects/[id]/card-fields/route.js")
  return [
    { name: "GET task project", repo: "getTaskProjectDetail", okStatus: 200, run: () => detail.GET(req("GET", `${T}/7/project`), ctx({ id: "7" })) },
    { name: "POST subtask", repo: "createSubtask", okStatus: 201, run: () => subtasks.POST(req("POST", `${T}/7/subtasks`, { title: " Sub ", assignee_email: "Mia@X.au", due_on: "2026-11-20" }), ctx({ id: "7" })) },
    { name: "POST subtask reorder", repo: "reorderSubtasks", okStatus: 200, run: () => reorder.POST(req("POST", `${T}/7/subtasks/reorder`, { ordered_ids: [9, 8] }), ctx({ id: "7" })) },
    { name: "GET fields", repo: "listProjectFields", okStatus: 200, run: () => fields.GET(req("GET", `${P}/5/fields`), ctx({ id: "5" })) },
    { name: "POST field", repo: "createCustomField", okStatus: 201, run: () => fields.POST(req("POST", `${P}/5/fields`, { name: "Progress", field_type: "single_select", options: ["A", "B"] }), ctx({ id: "5" })) },
    { name: "PATCH field", repo: "updateCustomField", okStatus: 200, run: () => field.PATCH(req("PATCH", `${P}/5/fields/3`, { name: "Stage" }), ctx({ id: "5", fieldId: "3" })) },
    { name: "DELETE field", repo: "deleteCustomField", okStatus: 200, run: () => field.DELETE(req("DELETE", `${P}/5/fields/3`), ctx({ id: "5", fieldId: "3" })) },
    { name: "PUT card fields", repo: "setProjectCardFields", okStatus: 200, run: () => cards.PUT(req("PUT", `${P}/5/card-fields`, { card_fields: [{ key: "field:3", show: false }] }), ctx({ id: "5" })) },
  ]
}

async function statuses(all: Call[]): Promise<number[]> {
  const out: number[] = []
  for (const c of all) out.push((await c.run()).status)
  return out
}

test("every method: codex_v2 off 404, codex_projects off 404 (with or without a session), no session 401, client 403, no email 401", { skip }, async () => {
  const all = await routes()
  assert.equal(all.length, 8)
  calls.length = 0
  session = STAFF
  assert.deepEqual(await withSwitches(false, true, () => statuses(all)), all.map(() => 404), "codex_v2 off")
  assert.deepEqual(await withSwitches(true, false, () => statuses(all)), all.map(() => 404), "codex_projects off")
  session = null
  assert.deepEqual(await withSwitches(true, false, () => statuses(all)), all.map(() => 404), "codex_projects off before the session gate")
  assert.deepEqual(await withSwitches(true, true, () => statuses(all)), all.map(() => 401), "no session")
  session = { user: { email: "c@client.com", roles: ["client"] } }
  assert.deepEqual(await withSwitches(true, false, () => statuses(all)), all.map(() => 404), "client, switch off")
  assert.deepEqual(await withSwitches(true, true, () => statuses(all)), all.map(() => 403), "client role")
  session = { user: { roles: ["admin"] } }
  assert.deepEqual(await withSwitches(true, true, () => statuses(all)), all.map(() => 401), "no email")
  assert.equal(calls.length, 0)
})

test("staff with both switches on: every method reaches its store with ids, the parsed body and the lower-case email", { skip }, async () => {
  const all = await routes()
  calls.length = 0
  mode = "ok"
  session = STAFF
  assert.deepEqual(await withSwitches(true, true, () => statuses(all)), all.map((c) => c.okStatus))
  assert.deepEqual(calls.map((c) => c.fn), all.map((c) => c.repo))
  const byFn = Object.fromEntries(calls.map((c) => [c.fn, c.args]))
  assert.deepEqual(byFn.getTaskProjectDetail.slice(0, 2), [7, "luke@x.au"])
  assert.deepEqual(byFn.createSubtask.slice(0, 3), [
    7,
    "luke@x.au",
    { title: "Sub", assignee_email: "mia@x.au", assignee_name: "Mia", start_on: null, due_on: "2026-11-20" },
  ])
  assert.deepEqual(byFn.reorderSubtasks.slice(0, 3), [7, "luke@x.au", [9, 8]])
  assert.deepEqual(byFn.createCustomField.slice(0, 2), [5, "luke@x.au"])
  assert.deepEqual((byFn.createCustomField[2] as { options: unknown }).options, [{ id: "o1", label: "A" }, { id: "o2", label: "B" }])
  assert.deepEqual(byFn.updateCustomField.slice(0, 4), [5, 3, "luke@x.au", { name: "Stage" }])
  assert.deepEqual(byFn.deleteCustomField.slice(0, 3), [5, 3, "luke@x.au"])
  assert.deepEqual(byFn.setProjectCardFields.slice(0, 3), [5, "luke@x.au", [{ key: "field:3", show: false }]])
})

test("an unexpected error is 500 without the detail", { skip }, async () => {
  const all = await routes()
  session = STAFF
  mode = "boom"
  for (const c of all) {
    const res = await withSwitches(true, true, () => c.run())
    const body = (await res.json()) as { error: string; message?: string }
    assert.equal(res.status, 500, c.name)
    assert.doesNotMatch(JSON.stringify(body), /secret/, c.name)
  }
  mode = "ok"
})

test("store refusals map to statuses", { skip }, async () => {
  const all = await routes()
  session = STAFF
  const cases: Array<[string, number]> = [
    ["not_found", 404],
    ["task_not_found", 404],
    ["nested_subtask", 409],
    ["too_many_subtasks", 409],
    ["invalid_order", 400],
    ["option_in_use", 409],
    ["field_has_values", 409],
    ["unknown_option", 409],
    ["invalid_done_option", 400],
    ["too_many_fields", 409],
  ]
  for (const [reason, status] of cases) {
    mode = reason
    for (const c of all) {
      const res = await withSwitches(true, true, () => c.run())
      assert.equal(res.status, status, `${c.name} ${reason}`)
      assert.equal(((await res.json()) as { error: string }).error, reason)
    }
  }
  mode = "ok"
})

test("bad ids are 404 and bad bodies 400, before the store; a shared assignee address is refused", { skip }, async () => {
  const subtasks = await import("../../../app/api/codex/tasks/[id]/subtasks/route.js")
  const reorder = await import("../../../app/api/codex/tasks/[id]/subtasks/reorder/route.js")
  const detail = await import("../../../app/api/codex/tasks/[id]/project/route.js")
  const fields = await import("../../../app/api/codex/projects/[id]/fields/route.js")
  const field = await import("../../../app/api/codex/projects/[id]/fields/[fieldId]/route.js")
  const cards = await import("../../../app/api/codex/projects/[id]/card-fields/route.js")
  session = STAFF
  mode = "ok"
  calls.length = 0
  const got = await withSwitches(true, true, async () => [
    (await detail.GET(req("GET", `${T}/x/project`), ctx({ id: "x" }))).status,
    (await subtasks.POST(req("POST", `${T}/0/subtasks`, { title: "a" }), ctx({ id: "0" }))).status,
    (await field.PATCH(req("PATCH", `${P}/5/fields/abc`, { name: "a" }), ctx({ id: "5", fieldId: "abc" }))).status,
    (await subtasks.POST(req("POST", `${T}/7/subtasks`, { title: " " }), ctx({ id: "7" }))).status,
    (await subtasks.POST(req("POST", `${T}/7/subtasks`, { title: "a", start_on: "2026-11-09", due_on: "2026-11-08" }), ctx({ id: "7" }))).status,
    (await reorder.POST(req("POST", `${T}/7/subtasks/reorder`, { ordered_ids: [] }), ctx({ id: "7" }))).status,
    (await fields.POST(req("POST", `${P}/5/fields`, { name: "Notes", field_type: "text", options: ["a"] }), ctx({ id: "5" }))).status,
    (await field.PATCH(req("PATCH", `${P}/5/fields/3`, { field_type: "multi_select" }), ctx({ id: "5", fieldId: "3" }))).status,
    (await cards.PUT(req("PUT", `${P}/5/card-fields`, { card_fields: [{ key: "title", show: true }] }), ctx({ id: "5" }))).status,
    (await subtasks.POST(req("POST", `${T}/7/subtasks`, { title: "a", assignee_email: "shared@x.au" }), ctx({ id: "7" }))).status,
  ])
  assert.deepEqual(got, [404, 404, 404, 400, 400, 400, 400, 400, 400, 409])
  assert.equal(calls.length, 0)
})
