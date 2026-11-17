/**
 * B41 task-write hooks on the project routes (review F3): a board move, the
 * complete button and subtask create read the task before the save
 * (`beforeTaskWrite`) and record follows and notifications after it
 * (`afterTaskWrite`), only when the save succeeded. A refused save records
 * nothing. The hooks are mocked here; `routes.notifyFailure.test.ts` runs the
 * real ones with a failing store. Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

const session = { user: { email: "Luke@X.au", roles: ["admin"] } }
/** Store calls and hook calls, in the order they happened. */
const events: Array<{ fn: string; args: unknown[] }> = []
/** "ok" or a refusal reason the store returns. */
let mode = "ok"

const TASK = { id: 7, status: "done", project_id: 5, section_id: 9, sort_order: 0 }
const SUB = { id: 31, title: "Sub", parent_task_id: 7 }
const BEFORE = new Map([[7, { id: 7, status: "todo", assignee_email: null, due: null }]])

function outcome<T>(okValue: T): T | { ok: false; reason: string; message: string } {
  if (mode !== "ok") return { ok: false, reason: mode, message: `m:${mode}` }
  return okValue
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  const fn = (name: string, value: () => unknown) => async (...args: unknown[]) => {
    events.push({ fn: name, args })
    return value()
  }
  await mock.module!("@/lib/codex/projectsRepo", {
    namedExports: {
      moveTaskToSection: fn("moveTaskToSection", () => outcome({ ok: true, task: TASK })),
      completeProjectTask: fn("completeProjectTask", () => outcome({ ok: true, task: TASK })),
      listSectionTasks: fn("listSectionTasks", () => outcome({ ok: true, items: [], total: 0 })),
    },
  })
  await mock.module!("@/lib/codex/taskDetailRepo", {
    namedExports: { createSubtask: fn("createSubtask", () => outcome({ ok: true, subtask: SUB })) },
  })
  await mock.module!("@/lib/codex/notify", {
    namedExports: {
      beforeTaskWrite: fn("beforeTaskWrite", () => BEFORE),
      afterTaskWrite: fn("afterTaskWrite", () => undefined),
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function on<T>(run: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", true)],
        ["codex_projects", row("codex_projects", true)],
      ])
  )
  try {
    return await run()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const P = "http://l/api/codex/projects"
const req = (url: string, body?: unknown) =>
  new Request(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const ctx = <Q extends Record<string, string>>(p: Q) => ({ params: Promise.resolve(p) })
const order = () => events.map((e) => e.fn)

test("board move: state read before the move, follows and notifications after a successful one, nothing after a refused one", { skip }, async () => {
  const move = await import("../../../app/api/codex/projects/[id]/sections/[sectionId]/tasks/route.js")
  const run = () => on(() => move.POST(req(`${P}/5/sections/9/tasks`, { task_id: 7 }), ctx({ id: "5", sectionId: "9" })))
  mode = "ok"
  events.length = 0
  assert.equal((await run()).status, 200)
  assert.deepEqual(order(), ["beforeTaskWrite", "moveTaskToSection", "afterTaskWrite"])
  assert.deepEqual(events[0]!.args, [[7]])
  assert.deepEqual(events[2]!.args, ["luke@x.au", BEFORE, [7]], "the actor, the state read before and the task")

  for (const reason of ["task_changed", "anchor_not_in_section", "not_found"]) {
    mode = reason
    events.length = 0
    const res = await run()
    assert.notEqual(res.status, 200, reason)
    assert.deepEqual(order(), ["beforeTaskWrite", "moveTaskToSection"], `refused (${reason}): nothing recorded`)
  }
  mode = "ok"
})

test("complete: state read before, recorded after a successful complete only", { skip }, async () => {
  const complete = await import("../../../app/api/codex/projects/[id]/tasks/[taskId]/complete/route.js")
  const run = () => on(() => complete.POST(req(`${P}/5/tasks/7/complete`), ctx({ id: "5", taskId: "7" })))
  mode = "ok"
  events.length = 0
  assert.equal((await run()).status, 200)
  assert.deepEqual(order(), ["beforeTaskWrite", "completeProjectTask", "afterTaskWrite"])
  assert.deepEqual(events[0]!.args, [[7]])
  assert.deepEqual(events[2]!.args, ["luke@x.au", BEFORE, [7]])

  mode = "no_done_section"
  events.length = 0
  assert.equal((await run()).status, 409)
  assert.deepEqual(order(), ["beforeTaskWrite", "completeProjectTask"], "refused: nothing recorded")
  mode = "ok"
})

test("subtask create: the new subtask recorded as created after a successful save only", { skip }, async () => {
  const subtasks = await import("../../../app/api/codex/tasks/[id]/subtasks/route.js")
  const run = () => on(() => subtasks.POST(req("http://l/api/codex/tasks/7/subtasks", { title: "Sub" }), ctx({ id: "7" })))
  mode = "ok"
  events.length = 0
  assert.equal((await run()).status, 201)
  assert.deepEqual(order(), ["createSubtask", "afterTaskWrite"])
  assert.deepEqual(events[1]!.args, ["luke@x.au", new Map(), [31], { created: true }])

  mode = "nested_subtask"
  events.length = 0
  assert.equal((await run()).status, 409)
  assert.deepEqual(order(), ["createSubtask"], "refused: nothing recorded")
  mode = "ok"
})
