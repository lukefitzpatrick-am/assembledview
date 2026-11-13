/**
 * B41: a notification failure never fails the save (review F3, H5). The real
 * `beforeTaskWrite` / `afterTaskWrite` run with codex_projects and
 * codex_notifications on while their store throws (the 0118 marker read
 * fails, so no database is reached). The board move, complete and subtask
 * create still answer as saved, and the hooks themselves resolve. Requires
 * --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

const session = { user: { email: "Luke@X.au", roles: ["admin"] } }
let markerReads = 0

class ProjectsUnavailableError extends Error {}

const TASK = { id: 7, status: "done", project_id: 5, section_id: 9, sort_order: 0 }
const SUB = { id: 31, title: "Sub", parent_task_id: 7 }

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/codex/projectsRepo", {
    namedExports: {
      ProjectsUnavailableError,
      moveTaskToSection: async () => ({ ok: true, task: TASK }),
      completeProjectTask: async () => ({ ok: true, task: TASK }),
      listSectionTasks: async () => ({ ok: true, items: [], total: 0 }),
    },
  })
  await mock.module!("@/lib/codex/taskDetailRepo", { namedExports: { createSubtask: async () => ({ ok: true, subtask: SUB }) } })
  // The notify store's first read: fails, as a lost database connection would.
  await mock.module!("@/lib/codex/projectsMarker", {
    namedExports: {
      isProjectsMigrationApplied: async () => {
        markerReads += 1
        throw new Error("connection lost")
      },
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
        ["codex_notifications", row("codex_notifications", true)],
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

test("the hooks never throw: the state read and the record after the save swallow a store failure", { skip }, async () => {
  const notify = await import("../notify.js")
  const errors = mock.method(console, "error", () => undefined)
  const warnings = mock.method(console, "warn", () => undefined)
  try {
    markerReads = 0
    const before = await on(() => notify.beforeTaskWrite([7]))
    assert.equal(before.size, 0)
    await on(() => notify.afterTaskWrite("luke@x.au", new Map(), [7], { created: true }))
    assert.ok(markerReads >= 2, "the store was reached and failed")
    assert.ok(errors.mock.calls.some((c) => String(c.arguments[0]).includes("task change not recorded")))
  } finally {
    errors.mock.restore()
    warnings.mock.restore()
  }
})

test("a board move, complete and subtask create answer as saved when recording the notifications fails", { skip }, async () => {
  const move = await import("../../../app/api/codex/projects/[id]/sections/[sectionId]/tasks/route.js")
  const complete = await import("../../../app/api/codex/projects/[id]/tasks/[taskId]/complete/route.js")
  const subtasks = await import("../../../app/api/codex/tasks/[id]/subtasks/route.js")
  const errors = mock.method(console, "error", () => undefined)
  const warnings = mock.method(console, "warn", () => undefined)
  try {
    markerReads = 0
    const moved = await on(() => move.POST(req(`${P}/5/sections/9/tasks`, { task_id: 7 }), ctx({ id: "5", sectionId: "9" })))
    assert.equal(moved.status, 200)
    assert.deepEqual(await moved.json(), { task: TASK })
    const done = await on(() => complete.POST(req(`${P}/5/tasks/7/complete`), ctx({ id: "5", taskId: "7" })))
    assert.equal(done.status, 200)
    assert.deepEqual(await done.json(), { task: TASK })
    const sub = await on(() => subtasks.POST(req("http://l/api/codex/tasks/7/subtasks", { title: "Sub" }), ctx({ id: "7" })))
    assert.equal(sub.status, 201)
    assert.deepEqual(await sub.json(), { subtask: SUB })
    assert.ok(markerReads >= 3, "each route's hook reached the failing store")
  } finally {
    errors.mock.restore()
    warnings.mock.restore()
  }
})
