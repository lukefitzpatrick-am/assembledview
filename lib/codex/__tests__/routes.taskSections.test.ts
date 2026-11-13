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
      bulkUpdateTasks: record("bulkUpdateTasks", () => [TASK]),
      bulkSoftDeleteTasks: record("bulkSoftDeleteTasks", () => [7]),
    },
  })
  await mock.module!("@/lib/codex/projectsRepo", {
    namedExports: {
      updateTaskThroughSections: record("updateTaskThroughSections", () =>
        mode === "refused"
          ? { ok: false, reason: "no_section_for_status", message: "No section in this task's project has the Backlog status." }
          : mode === "missing"
            ? { ok: true, task: null }
            : { ok: true, task: TASK }
      ),
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
  assert.deepEqual(calls[0].args.slice(0, 3), [7, { status: "waiting", title: "New" }, "luke@x.au"])
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
  assert.deepEqual(calls[0].args.slice(0, 2), [[7, 8], { status: "done" }])
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
