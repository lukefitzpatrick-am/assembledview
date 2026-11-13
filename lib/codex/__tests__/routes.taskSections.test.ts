/**
 * B39: PATCH /api/codex/tasks/[id] and POST /api/codex/tasks/bulk move a
 * project task only through the section rules when codex_projects is on.
 * Off, or with no status in the patch, both routes call the plain store as
 * before. A refused move is 409 with the reason. Requires
 * --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

const calls: Array<{ fn: string; args: unknown[] }> = []
/** "ok", "refused" (409 no_section_for_status), "plain" (bulk path not taken: null). */
let mode = "ok"

class CodexBulkError extends Error {
  readonly taskId: number
  readonly statusCode: 400 | 409
  constructor(taskId: number, statusCode: 400 | 409, message: string) {
    super(message)
    this.taskId = taskId
    this.statusCode = statusCode
  }
}

const TASK = { id: 7, title: "t", status: "waiting", client_id: 0 }

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: { auth0: { getSession: async () => ({ user: { email: "Luke@X.au", roles: ["admin"] } }) } },
  })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: async () => null } })
  await mock.module!("@/lib/codex/assigneeWrite", {
    namedExports: { resolveAssigneeForWrite: async (email: string) => ({ ok: true, email, name: null, resolved: false }) },
  })
  await mock.module!("@/lib/codex/clientExists", { namedExports: { codexClientExists: async () => true } })
  const record = (fn: string, value: () => unknown) => async (...args: unknown[]) => {
    calls.push({ fn, args })
    return value()
  }
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      CodexBulkError,
      getTask: record("getTask", () => TASK),
      softDeleteTask: record("softDeleteTask", () => true),
      updateTask: record("updateTask", () => TASK),
      createTask: record("createTask", () => TASK),
      listTasks: record("listTasks", () => ({ items: [TASK], itemsTotal: 1 })),
      parseStatusFilter: () => undefined,
      bulkUpdateTasks: record("bulkUpdateTasks", () => [TASK]),
      bulkSoftDeleteTasks: record("bulkSoftDeleteTasks", () => [7]),
    },
  })
  await mock.module!("@/lib/codex/projectsRepo", {
    namedExports: {
      updateTaskThroughSections: record("updateTaskThroughSections", () => {
        if (mode === "unavailable") throw Object.assign(new Error("0118"), { code: "PROJECTS_UNAVAILABLE" })
        if (mode.startsWith("fail:")) return { ok: false, reason: mode.slice(5), message: `m:${mode}` }
        return mode === "refused"
          ? { ok: false, reason: "no_section_for_status", message: "No section in this task's project has the Backlog status." }
          : mode === "missing"
            ? { ok: true, task: null }
            : { ok: true, task: TASK }
      }),
      attachTaskS1Fields: record("attachTaskS1Fields", () => [{ ...TASK, task_type: "subtask" }]),
      bulkUpdateTasksThroughSections: record("bulkUpdateTasksThroughSections", () => {
        if (mode === "refused") throw new CodexBulkError(7, 409, "Task 7: No section in this task's project has the Backlog status.")
        return mode === "plain" ? null : [TASK]
      }),
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withProjects<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", true)],
        ["codex_projects", row("codex_projects", on)],
      ])
  )
  try {
    return await fn()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const json = (method: string, url: string, body: unknown) =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const ctx = { params: Promise.resolve({ id: "7" }) }

test("PATCH: switch off, the plain update even with a status", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  calls.length = 0
  mode = "ok"
  const res = await withProjects(false, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { status: "backlog" }), ctx))
  assert.equal(res.status, 200)
  assert.deepEqual(calls.map((c) => c.fn), ["updateTask"])
})

test("PATCH: switch on with a status goes through the sections; without a status the plain update", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  calls.length = 0
  mode = "ok"
  const res = await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { status: "waiting", title: " New " }), ctx))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), TASK)
  assert.equal(calls[0].fn, "updateTaskThroughSections")
  assert.deepEqual(calls[0].args.slice(0, 3), [7, { status: "waiting", title: "New", trackAssignedBy: true }, "luke@x.au"])
  calls.length = 0
  await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { title: "Only title" }), ctx))
  assert.deepEqual(calls.map((c) => c.fn), ["updateTask"])
})

test("PATCH: a refused move is 409 with the reason; a missing task 404", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  mode = "refused"
  const res = await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { status: "backlog" }), ctx))
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), {
    error: "no_section_for_status",
    message: "No section in this task's project has the Backlog status.",
  })
  mode = "missing"
  const gone = await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { status: "done" }), ctx))
  assert.equal(gone.status, 404)
  mode = "ok"
})

test("bulk: switch off or no status, the plain bulk; on, through the sections; a refusal is 409 naming the task", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/bulk/route.js")
  const url = "http://l/api/codex/tasks/bulk"
  calls.length = 0
  mode = "ok"
  await withProjects(false, () => route.POST(json("POST", url, { ids: [7], patch: { status: "done" } })))
  await withProjects(true, () => route.POST(json("POST", url, { ids: [7], patch: { priority: "high" } })))
  assert.deepEqual(calls.map((c) => c.fn), ["bulkUpdateTasks", "bulkUpdateTasks"])
  calls.length = 0
  const res = await withProjects(true, () => route.POST(json("POST", url, { ids: [7, 8], patch: { status: "done" } })))
  assert.equal(res.status, 200)
  assert.deepEqual(calls.map((c) => c.fn), ["bulkUpdateTasksThroughSections"])
  assert.deepEqual(calls[0].args.slice(0, 2), [[7, 8], { status: "done", trackAssignedBy: true }])
  calls.length = 0
  mode = "plain"
  await withProjects(true, () => route.POST(json("POST", url, { ids: [7], patch: { status: "done" } })))
  assert.deepEqual(calls.map((c) => c.fn), ["bulkUpdateTasksThroughSections", "bulkUpdateTasks"], "before 0118 the plain bulk")
  mode = "refused"
  const refused = await withProjects(true, () => route.POST(json("POST", url, { ids: [7], patch: { status: "backlog" } })))
  assert.equal(refused.status, 409)
  const body = (await refused.json()) as { error: string; id: number; message: string }
  assert.equal(body.error, "conflict")
  assert.equal(body.id, 7)
  assert.match(body.message, /Backlog/)
  mode = "ok"
})

// ---------------------------------------------------------------------------
// B40: the detail keys, asap and assigned by on PATCH, bulk and create
// ---------------------------------------------------------------------------

test("PATCH B40 keys: off, ignored and asap refused (400); on, parsed and passed to the store", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  calls.length = 0
  mode = "ok"
  const offDetails = await withProjects(false, () =>
    route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { title: "T", start_on: "2026-11-02", custom_values: { "3": "o1" } }), ctx)
  )
  assert.equal(offDetails.status, 200)
  assert.deepEqual(calls.map((c) => c.fn), ["updateTask"])
  assert.deepEqual(calls[0].args[1], { title: "T" }, "off: no detail keys and no assigned-by tracking")
  const offAsap = await withProjects(false, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { priority: "asap" }), ctx))
  assert.equal(offAsap.status, 400)
  calls.length = 0
  const on = await withProjects(true, () =>
    route.PATCH(
      json("PATCH", "http://l/api/codex/tasks/7", { priority: "asap", start_on: "2026-11-02", due_on: "2026-11-05", task_type: "milestone", custom_values: { "3": ["o1"] } }),
      ctx
    )
  )
  assert.equal(on.status, 200)
  assert.equal(calls[0].fn, "updateTaskThroughSections")
  assert.deepEqual(calls[0].args[1], { priority: "asap", trackAssignedBy: true })
  assert.deepEqual(calls[0].args[4], { start_on: "2026-11-02", due_on: "2026-11-05", task_type: "milestone", custom_values: { "3": ["o1"] } })
  calls.length = 0
  await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { due_date: "2026-11-05" }), ctx))
  assert.equal(calls[0].fn, "updateTaskThroughSections", "a due date change is checked against the start date")
})

test("PATCH B40: bad detail bodies are 400 before the store; assigned_by_email in the body is ignored", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  mode = "ok"
  for (const body of [
    { due_on: "2026-11-05", due_date: "2026-11-05" },
    { start_on: "2026-11-06", due_on: "2026-11-05" },
    { task_type: "subtask" },
    { custom_values: "o1" },
    { start_on: "tomorrow" },
  ]) {
    calls.length = 0
    const res = await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", body), ctx))
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.equal(calls.length, 0, JSON.stringify(body))
  }
  calls.length = 0
  await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { title: "x", assigned_by_email: "someone@x.au" }), ctx))
  assert.deepEqual(calls[0].args[1], { title: "x", trackAssignedBy: true }, "never client-supplied")
})

test("PATCH B40: store refusals map to statuses; 503 before 0118", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  const cases: Array<[string, number]> = [
    ["start_after_due", 409],
    ["task_type_fixed", 409],
    ["not_in_project", 409],
    ["unknown_field", 400],
    ["invalid_value", 400],
    ["not_found", 404],
  ]
  for (const [reason, status] of cases) {
    mode = `fail:${reason}`
    const res = await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { start_on: "2026-11-02" }), ctx))
    assert.equal(res.status, status, reason)
    assert.equal(((await res.json()) as { error: string }).error, reason)
  }
  mode = "unavailable"
  const res = await withProjects(true, () => route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { start_on: "2026-11-02" }), ctx))
  assert.equal(res.status, 503)
  assert.equal(((await res.json()) as { error: string }).error, "migration_not_applied")
  mode = "ok"
})

test("bulk and create: assigned by is tracked only with the switch on", { skip }, async () => {
  const bulk = await import("../../../app/api/codex/tasks/bulk/route.js")
  const url = "http://l/api/codex/tasks/bulk"
  mode = "ok"
  calls.length = 0
  await withProjects(false, () => bulk.POST(json("POST", url, { ids: [7], patch: { assignee_email: "mia@x.au" } })))
  await withProjects(true, () => bulk.POST(json("POST", url, { ids: [7], patch: { assignee_email: "mia@x.au" } })))
  assert.deepEqual(calls.map((c) => c.fn), ["bulkUpdateTasks", "bulkUpdateTasks"])
  assert.equal((calls[0].args[1] as { trackAssignedBy?: boolean }).trackAssignedBy, undefined)
  assert.equal((calls[1].args[1] as { trackAssignedBy?: boolean }).trackAssignedBy, true)
  const create = await import("../../../app/api/codex/tasks/route.js")
  calls.length = 0
  await withProjects(false, () => create.POST(json("POST", "http://l/api/codex/tasks", { title: "x", client_id: 4, assignee_email: "mia@x.au" })))
  await withProjects(true, () => create.POST(json("POST", "http://l/api/codex/tasks", { title: "x", client_id: 4, assignee_email: "mia@x.au" })))
  assert.deepEqual(calls.map((c) => c.fn), ["createTask", "createTask"])
  assert.equal((calls[0].args[0] as { trackAssignedBy?: boolean }).trackAssignedBy, false)
  assert.equal((calls[1].args[0] as { trackAssignedBy?: boolean }).trackAssignedBy, true)
})

test("GET list: rows carry the B40 fields only with the switch on", { skip }, async () => {
  const list = await import("../../../app/api/codex/tasks/route.js")
  calls.length = 0
  const off = await withProjects(false, () => list.GET(new Request("http://l/api/codex/tasks")))
  assert.deepEqual(((await off.json()) as { items: unknown[] }).items, [TASK])
  const on = await withProjects(true, () => list.GET(new Request("http://l/api/codex/tasks")))
  assert.deepEqual(((await on.json()) as { items: Array<{ task_type?: string }> }).items[0].task_type, "subtask")
  assert.deepEqual(calls.map((c) => c.fn), ["listTasks", "listTasks", "attachTaskS1Fields"])
})
