/**
 * R1 (B43fix): every Codex task write route answers a Postgres lock conflict
 * (deadlock 40P01, lock timeout 55P03) with 409 `try_again`, and never sends
 * a database error's own text (Drizzle's "Failed query: <sql> params: ...")
 * back to the client. Any other error keeps its message, as before.
 *
 * - Route level: PATCH and DELETE on a task, the bulk route (plain store
 *   throwing a raw error, and a CodexBulkError carrying a code), and a
 *   projects route through `projectsErrorResponse` (the section move).
 * - Source scan: every write handler under app/api/codex/tasks/**, the
 *   projects routes and the proposal accept route ends in
 *   `writeFailureResponse` or `projectsErrorResponse`, never a raw
 *   `error.message` 500.
 *
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import {
  DATABASE_ERROR_MESSAGE,
  isDatabaseError,
  isLockConflict,
  LOCK_CONFLICT_MESSAGE,
  safeErrorMessage,
  sqlStateOf,
} from "../dbErrors.js"

const skip = mockModuleSkip()

class CodexBulkError extends Error {
  readonly taskId: number
  readonly statusCode: 400 | 409
  readonly code: string | undefined
  constructor(taskId: number, statusCode: 400 | 409, message: string, code?: string) {
    super(message)
    this.taskId = taskId
    this.statusCode = statusCode
    this.code = code
  }
}
class ProjectsUnavailableError extends Error {
  readonly code = "PROJECTS_UNAVAILABLE"
}

const SQL_TEXT = 'Failed query: SELECT p.id FROM public.codex_projects p WHERE p.id = $1 FOR SHARE OF p\nparams: 12'

/** A Drizzle-shaped error: the driver's error (with its SQLSTATE) on `cause`. */
function drizzleError(code: string): Error {
  const cause = Object.assign(new Error(code === "40P01" ? "deadlock detected" : "duplicate key value"), { name: "PostgresError", code })
  return Object.assign(new Error(SQL_TEXT), { name: "DrizzleQueryError", cause })
}

/** What the mocked store throws next: null returns normally. */
let failure: unknown = null
const failOrReturn = <T>(value: T) => async () => {
  if (failure) throw failure
  return value
}

const TASK = { id: 7, title: "t", status: "todo", client_id: 0 }

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: { auth0: { getSession: async () => ({ user: { email: "luke@x.au", roles: ["admin"] } }) } },
  })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: async () => null } })
  await mock.module!("@/lib/codex/assigneeWrite", {
    namedExports: { resolveAssigneeForWrite: async (email: string) => ({ ok: true, email, name: null, resolved: false }) },
  })
  await mock.module!("@/lib/codex/clientExists", { namedExports: { codexClientExists: async () => true } })
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      CodexBulkError,
      getTask: failOrReturn(TASK),
      softDeleteTask: failOrReturn(true),
      updateTask: failOrReturn(TASK),
      bulkUpdateTasks: failOrReturn([TASK]),
      bulkSoftDeleteTasks: failOrReturn([7]),
    },
  })
  await mock.module!("@/lib/codex/notify", {
    namedExports: { beforeTaskWrite: async () => new Map(), afterTaskWrite: async () => {} },
  })
  await mock.module!("@/lib/codex/taskVisibility", {
    namedExports: { isTaskHiddenFrom: async () => false, hiddenTaskIds: async () => new Set() },
  })
  await mock.module!("@/db", { namedExports: { db: {} } })
  await mock.module!("@/lib/codex/projectsRepo", {
    namedExports: {
      ProjectsUnavailableError,
      isProjectsMigrationApplied: async () => true,
      moveTaskToSection: failOrReturn({ ok: true, task: TASK }),
      listSectionTasks: failOrReturn({ ok: true, items: [], total: 0 }),
      updateTaskThroughSections: failOrReturn({ ok: true, task: TASK }),
      bulkUpdateTasksThroughSections: failOrReturn(null),
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}
async function withSwitches<T>(projects: boolean, fn: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", true)],
        ["codex_projects", row("codex_projects", projects)],
      ])
  )
  try {
    return await fn()
  } finally {
    setFeatureRowReaderForTests(null)
    failure = null
  }
}

const json = (method: string, url: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
const ctx = { params: Promise.resolve({ id: "7" }) }

test("dbErrors: the SQLSTATE is read from the error or its cause; only 40P01 and 55P03 are lock conflicts", () => {
  assert.equal(sqlStateOf(drizzleError("40P01")), "40P01")
  assert.equal(sqlStateOf(Object.assign(new Error("x"), { code: "55P03" })), "55P03")
  assert.equal(sqlStateOf(Object.assign(new Error("x"), { code: "PROJECTS_UNAVAILABLE" })), null)
  assert.equal(isLockConflict(drizzleError("40P01")), true)
  assert.equal(isLockConflict(drizzleError("55P03")), true)
  assert.equal(isLockConflict(drizzleError("23505")), false)
  assert.equal(isLockConflict(new Error("deadlock detected")), false, "the code decides, never the text")
  assert.equal(isDatabaseError(drizzleError("23505")), true)
  assert.equal(isDatabaseError(Object.assign(new Error("Failed query: SELECT 1"), {})), true)
  assert.equal(isDatabaseError(new Error("Invalid recurring_rule")), false)
  assert.equal(safeErrorMessage(drizzleError("23505")), DATABASE_ERROR_MESSAGE)
  assert.equal(safeErrorMessage(new Error("boom")), "boom")
})

for (const code of ["40P01", "55P03"]) {
  test(`PATCH and DELETE on a task: ${code} is 409 try_again with no SQL`, { skip }, async () => {
    const route = await import("../../../app/api/codex/tasks/[id]/route.js")
    for (const projects of [false, true]) {
      const patched = await withSwitches(projects, async () => {
        failure = drizzleError(code)
        return route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { title: "x" }), ctx)
      })
      assert.equal(patched.status, 409, `PATCH, codex_projects ${projects}`)
      assert.deepEqual(await patched.json(), { error: "try_again", message: LOCK_CONFLICT_MESSAGE })
    }
    const deleted = await withSwitches(false, async () => {
      failure = drizzleError(code)
      return route.DELETE(json("DELETE", "http://l/api/codex/tasks/7"), ctx)
    })
    assert.equal(deleted.status, 409)
    assert.deepEqual(await deleted.json(), { error: "try_again", message: LOCK_CONFLICT_MESSAGE })
  })
}

test("PATCH: any other database error is 500 with a generic line, never the SQL; an app error keeps its text", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  const res = await withSwitches(false, async () => {
    failure = drizzleError("23505")
    return route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { title: "x" }), ctx)
  })
  assert.equal(res.status, 500)
  const body = (await res.json()) as { error: string; message: string }
  assert.deepEqual(body, { error: "Failed to update task", message: DATABASE_ERROR_MESSAGE })
  assert.doesNotMatch(JSON.stringify(body), /Failed query|codex_projects|params/)
  const plain = await withSwitches(false, async () => {
    failure = new Error("boom")
    return route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { title: "x" }), ctx)
  })
  assert.equal(plain.status, 500)
  assert.deepEqual(await plain.json(), { error: "Failed to update task", message: "boom" })
})

test("PATCH (R2, PACK4fix): a task that moved into a project while the assignment waited is 409 task_changed", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/[id]/route.js")
  const { TaskJoinedProjectError } = await import("../projects.js")
  for (const projects of [false, true]) {
    const res = await withSwitches(projects, async () => {
      failure = new TaskJoinedProjectError(7)
      return route.PATCH(json("PATCH", "http://l/api/codex/tasks/7", { assignee_email: "mia@x.au" }), ctx)
    })
    assert.equal(res.status, 409, `codex_projects ${projects}`)
    assert.deepEqual(await res.json(), { error: "task_changed", message: "The task moved project while saving. Reload and try again." })
  }
})

test("bulk: a raw lock conflict is 409 try_again; a raw database error never carries its SQL", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/bulk/route.js")
  const body = { ids: [7, 8], patch: { assignee_email: "mia@x.au" } }
  const busy = await withSwitches(false, async () => {
    failure = drizzleError("40P01")
    return route.POST(json("POST", "http://l/api/codex/tasks/bulk", body))
  })
  assert.equal(busy.status, 409)
  assert.deepEqual(await busy.json(), { error: "try_again", message: LOCK_CONFLICT_MESSAGE })
  const broken = await withSwitches(false, async () => {
    failure = drizzleError("23505")
    return route.POST(json("POST", "http://l/api/codex/tasks/bulk", body))
  })
  assert.equal(broken.status, 500)
  assert.doesNotMatch(JSON.stringify(await broken.json()), /Failed query|codex_projects|params/)
})

test("bulk: a CodexBulkError keeps its status and message and answers its own code (try_again, task_changed)", { skip }, async () => {
  const route = await import("../../../app/api/codex/tasks/bulk/route.js")
  const body = { ids: [7, 8], patch: { assignee_email: "mia@x.au" } }
  const coded = await withSwitches(false, async () => {
    failure = new CodexBulkError(8, 409, LOCK_CONFLICT_MESSAGE, "try_again")
    return route.POST(json("POST", "http://l/api/codex/tasks/bulk", body))
  })
  assert.equal(coded.status, 409)
  assert.deepEqual(await coded.json(), { error: "try_again", message: LOCK_CONFLICT_MESSAGE, id: 8 })
  const plain = await withSwitches(false, async () => {
    failure = new CodexBulkError(8, 409, "Task 8 was not found.")
    return route.POST(json("POST", "http://l/api/codex/tasks/bulk", body))
  })
  assert.deepEqual(await plain.json(), { error: "conflict", message: "Task 8 was not found.", id: 8 }, "no code: as before")
})

test("a projects route (section move): a lock conflict is 409 try_again; anything else stays a 500 without detail", { skip }, async () => {
  const route = await import("../../../app/api/codex/projects/[id]/sections/[sectionId]/tasks/route.js")
  const moveCtx = { params: Promise.resolve({ id: "3", sectionId: "4" }) }
  const busy = await withSwitches(true, async () => {
    failure = drizzleError("40P01")
    return route.POST(json("POST", "http://l/api/codex/projects/3/sections/4/tasks", { task_id: 7 }), moveCtx)
  })
  assert.equal(busy.status, 409)
  assert.deepEqual(await busy.json(), { error: "try_again", message: LOCK_CONFLICT_MESSAGE })
  const broken = await withSwitches(true, async () => {
    failure = drizzleError("23505")
    return route.POST(json("POST", "http://l/api/codex/projects/3/sections/4/tasks", { task_id: 7 }), moveCtx)
  })
  assert.equal(broken.status, 500)
  assert.deepEqual(await broken.json(), { error: "projects_failed", message: "Projects failed. Try again." })
})

/** Every write handler body (POST, PATCH, PUT, DELETE) of a route file, by name. */
function writeHandlers(source: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /^export async function (POST|PATCH|PUT|DELETE)\b/gm
  const starts = [...source.matchAll(re)].map((m) => ({ name: m[1], at: m.index ?? 0 }))
  starts.forEach((s, i) => {
    const rest = source.slice(s.at + 1)
    const next = rest.search(/^export (async )?function /m)
    out.set(s.name, next === -1 ? source.slice(s.at) : source.slice(s.at, s.at + 1 + next))
  })
  return out
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...routeFiles(full))
    else if (entry.name === "route.ts") out.push(full)
  }
  return out
}

test("scan: every Codex task write handler ends in writeFailureResponse or projectsErrorResponse, never a raw message 500", () => {
  const root = path.join(process.cwd(), "app/api/codex")
  const files = [
    ...routeFiles(path.join(root, "tasks")),
    ...routeFiles(path.join(root, "projects")),
    path.join(root, "proposals/[id]/accept/route.ts"),
  ]
  const offenders: string[] = []
  let handlers = 0
  for (const file of files) {
    for (const [name, body] of writeHandlers(fs.readFileSync(file, "utf8"))) {
      handlers += 1
      const rel = `${path.relative(root, file)} ${name}`
      if (!/writeFailureResponse\(|projectsErrorResponse\(/.test(body)) offenders.push(`${rel}: no shared failure response`)
      if (/error instanceof Error \? error\.message : String\(error\)/.test(body)) offenders.push(`${rel}: a raw error message`)
    }
  }
  assert.ok(handlers >= 30, `found ${handlers} write handlers`)
  assert.deepEqual(offenders, [])
})
