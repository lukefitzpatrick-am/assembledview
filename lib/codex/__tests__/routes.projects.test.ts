/**
 * /api/codex/projects/** (S1, B38): the full guard chain on every method
 * (codex_v2 404, codex_projects 404, session 401, staff 403), 503 before
 * migration 0118, and every failure mapped to its status. Requires
 * --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

let session: null | { user: { email?: string; roles: string[] } } = null
const calls: Array<{ fn: string; args: unknown[] }> = []
/** "ok", "unavailable", "boom", or a failure reason the store returns. */
let mode = "ok"

class ProjectsUnavailableError extends Error {}

const PROJECT = { id: 5, name: "Sinch", members: [] }
const SECTION = { id: 9, project_id: 5, name: "Done", sort_order: 0, collapsed_default: false, status_category: "done" }
const TASK = { id: 7, status: "done", project_id: 5, section_id: 9, sort_order: 0 }

function outcome<T>(okValue: T): T | { ok: false; reason: string; message: string } {
  if (mode === "unavailable") throw new ProjectsUnavailableError("0118")
  if (mode === "boom") throw new Error("secret detail")
  if (mode !== "ok") return { ok: false, reason: mode, message: `m:${mode}` }
  return okValue
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  const fn = (name: string, value: () => unknown) => async (...args: unknown[]) => {
    calls.push({ fn: name, args })
    return value()
  }
  await mock.module!("@/lib/codex/projectsRepo", {
    namedExports: {
      ProjectsUnavailableError,
      listProjects: fn("listProjects", () => outcome([PROJECT])),
      createProject: fn("createProject", () => outcome({ ok: true, project: PROJECT, sections: [SECTION] })),
      getProject: fn("getProject", () => outcome({ ok: true, project: PROJECT, sections: [SECTION] })),
      updateProject: fn("updateProject", () => outcome({ ok: true, project: PROJECT })),
      addProjectMembers: fn("addProjectMembers", () => outcome({ ok: true, project: PROJECT })),
      removeProjectMember: fn("removeProjectMember", () => outcome({ ok: true, project: PROJECT })),
      listSections: fn("listSections", () => outcome({ ok: true, sections: [SECTION] })),
      createSection: fn("createSection", () => outcome({ ok: true, section: SECTION })),
      updateSection: fn("updateSection", () => outcome({ ok: true, section: SECTION })),
      deleteSection: fn("deleteSection", () => outcome({ ok: true })),
      reorderSections: fn("reorderSections", () => outcome({ ok: true, sections: [SECTION] })),
      moveTaskToSection: fn("moveTaskToSection", () => outcome({ ok: true, task: TASK })),
      completeProjectTask: fn("completeProjectTask", () => outcome({ ok: true, task: TASK })),
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withSwitches<T>(codex: boolean, projects: boolean, fn: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", codex)],
        ["codex_projects", row("codex_projects", projects)],
      ])
  )
  try {
    return await fn()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const U = "http://l/api/codex/projects"
const req = (method: string, url: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const ctx = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) })
const STAFF = { user: { email: "Luke@X.au", roles: ["admin"] } }

type Call = { name: string; run: () => Promise<Response>; repo: string; okStatus: number }

async function routes(): Promise<Call[]> {
  const list = await import("../../../app/api/codex/projects/route.js")
  const one = await import("../../../app/api/codex/projects/[id]/route.js")
  const members = await import("../../../app/api/codex/projects/[id]/members/route.js")
  const sections = await import("../../../app/api/codex/projects/[id]/sections/route.js")
  const section = await import("../../../app/api/codex/projects/[id]/sections/[sectionId]/route.js")
  const reorder = await import("../../../app/api/codex/projects/[id]/sections/reorder/route.js")
  const move = await import("../../../app/api/codex/projects/[id]/sections/[sectionId]/tasks/route.js")
  const complete = await import("../../../app/api/codex/projects/[id]/tasks/[taskId]/complete/route.js")
  return [
    { name: "GET projects", repo: "listProjects", okStatus: 200, run: () => list.GET(req("GET", U)) },
    { name: "POST projects", repo: "createProject", okStatus: 201, run: () => list.POST(req("POST", U, { name: "Sinch", kind: "campaign" })) },
    { name: "GET project", repo: "getProject", okStatus: 200, run: () => one.GET(req("GET", `${U}/5`), ctx({ id: "5" })) },
    { name: "PATCH project", repo: "updateProject", okStatus: 200, run: () => one.PATCH(req("PATCH", `${U}/5`, { name: "New" }), ctx({ id: "5" })) },
    { name: "POST members", repo: "addProjectMembers", okStatus: 200, run: () => members.POST(req("POST", `${U}/5/members`, { emails: ["A@x.au"] }), ctx({ id: "5" })) },
    { name: "DELETE member", repo: "removeProjectMember", okStatus: 200, run: () => members.DELETE(req("DELETE", `${U}/5/members?email=A@x.au`), ctx({ id: "5" })) },
    { name: "GET sections", repo: "listSections", okStatus: 200, run: () => sections.GET(req("GET", `${U}/5/sections`), ctx({ id: "5" })) },
    { name: "POST sections", repo: "createSection", okStatus: 201, run: () => sections.POST(req("POST", `${U}/5/sections`, { name: "Done" }), ctx({ id: "5" })) },
    { name: "PATCH section", repo: "updateSection", okStatus: 200, run: () => section.PATCH(req("PATCH", `${U}/5/sections/9`, { name: "Shipped" }), ctx({ id: "5", sectionId: "9" })) },
    { name: "DELETE section", repo: "deleteSection", okStatus: 200, run: () => section.DELETE(req("DELETE", `${U}/5/sections/9`), ctx({ id: "5", sectionId: "9" })) },
    { name: "POST reorder", repo: "reorderSections", okStatus: 200, run: () => reorder.POST(req("POST", `${U}/5/sections/reorder`, { ordered_ids: [9] }), ctx({ id: "5" })) },
    { name: "POST move", repo: "moveTaskToSection", okStatus: 200, run: () => move.POST(req("POST", `${U}/5/sections/9/tasks`, { task_id: 7 }), ctx({ id: "5", sectionId: "9" })) },
    { name: "POST complete", repo: "completeProjectTask", okStatus: 200, run: () => complete.POST(req("POST", `${U}/5/tasks/7/complete`), ctx({ id: "5", taskId: "7" })) },
  ]
}

async function statuses(all: Call[]): Promise<number[]> {
  const out: number[] = []
  for (const c of all) out.push((await c.run()).status)
  return out
}

test("every method: codex_v2 off 404, codex_projects off 404, no session 401, client 403, no email 401; the store is never reached", { skip }, async () => {
  const all = await routes()
  assert.equal(all.length, 13)
  calls.length = 0
  session = STAFF
  assert.deepEqual(await withSwitches(false, true, () => statuses(all)), all.map(() => 404), "codex_v2 off")
  assert.deepEqual(await withSwitches(true, false, () => statuses(all)), all.map(() => 404), "codex_projects off")
  assert.deepEqual(await withSwitches(false, false, () => statuses(all)), all.map(() => 404), "both off")
  session = null
  assert.deepEqual(await withSwitches(true, true, () => statuses(all)), all.map(() => 401), "no session")
  session = { user: { email: "c@client.com", roles: ["client"] } }
  assert.deepEqual(await withSwitches(true, true, () => statuses(all)), all.map(() => 403), "client role")
  session = { user: { roles: ["admin"] } }
  assert.deepEqual(await withSwitches(true, true, () => statuses(all)), all.map(() => 401), "no email")
  assert.equal(calls.length, 0)
})

test("off: the 404 body is not_found and carries nothing else", { skip }, async () => {
  const [first] = await routes()
  session = STAFF
  const res = await withSwitches(true, false, () => first.run())
  assert.deepEqual(await res.json(), { error: "not_found" })
})

test("staff with both switches on: every method reaches its store with the lower-case email", { skip }, async () => {
  const all = await routes()
  calls.length = 0
  mode = "ok"
  session = STAFF
  const got = await withSwitches(true, true, () => statuses(all))
  assert.deepEqual(got, all.map((c) => c.okStatus))
  assert.deepEqual(calls.map((c) => c.fn), all.map((c) => c.repo))
  const emailArg: Record<string, number> = {
    listProjects: 0, createProject: 0, getProject: 1, updateProject: 1, addProjectMembers: 1, removeProjectMember: 1,
    listSections: 1, createSection: 1, updateSection: 2, deleteSection: 2, reorderSections: 1, moveTaskToSection: 2, completeProjectTask: 2,
  }
  for (const c of calls) assert.equal(c.args[emailArg[c.fn]], "luke@x.au", c.fn)
  const byFn = Object.fromEntries(calls.map((c) => [c.fn, c.args]))
  assert.deepEqual(byFn.getProject.slice(0, 1), [5])
  assert.deepEqual(byFn.addProjectMembers[2], ["a@x.au"])
  assert.equal(byFn.removeProjectMember[2], "a@x.au")
  assert.deepEqual(byFn.updateSection.slice(0, 2), [5, 9])
  assert.deepEqual(byFn.reorderSections[2], [9])
  assert.deepEqual(byFn.moveTaskToSection[3], { task_id: 7, sort_order: null })
  assert.deepEqual(byFn.completeProjectTask.slice(0, 2), [5, 7])
})

test("before migration 0118: every method is 503 migration_not_applied, never 500", { skip }, async () => {
  const all = await routes()
  mode = "unavailable"
  session = STAFF
  for (const c of all) {
    const res = await withSwitches(true, true, () => c.run())
    assert.equal(res.status, 503, c.name)
    assert.equal(((await res.json()) as { error: string }).error, "migration_not_applied", c.name)
  }
  mode = "ok"
})

test("an unexpected error is 500 without the detail", { skip }, async () => {
  const all = await routes()
  mode = "boom"
  session = STAFF
  const original = console.error
  console.error = () => {}
  try {
    for (const c of all) {
      const res = await withSwitches(true, true, () => c.run())
      assert.equal(res.status, 500, c.name)
      assert.doesNotMatch(JSON.stringify(await res.json()), /secret detail/)
    }
  } finally {
    console.error = original
    mode = "ok"
  }
})

test("store refusals map to statuses: private or missing 404, not owner 403, rules 409, unknown client and bad order 400", { skip }, async () => {
  const all = await routes()
  session = STAFF
  const want: Record<string, number> = {
    not_found: 404,
    task_not_found: 404,
    not_owner: 403,
    unknown_client: 400,
    invalid_order: 400,
    mba_taken: 409,
    too_many_sections: 409,
    too_many_members: 409,
    other_project: 409,
    last_done_section: 409,
    section_not_empty: 409,
    no_done_section: 409,
  }
  // GET projects returns a list, not a result; the rest pass refusals through.
  for (const c of all.slice(1)) {
    for (const [reason, status] of Object.entries(want)) {
      mode = reason
      const res = await withSwitches(true, true, () => c.run())
      assert.equal(res.status, status, `${c.name} ${reason}`)
      assert.deepEqual(await res.json(), { error: reason, message: `m:${reason}` })
    }
  }
  mode = "ok"
})

test("bad ids are 404 and bad bodies 400, before the store", { skip }, async () => {
  const one = await import("../../../app/api/codex/projects/[id]/route.js")
  const list = await import("../../../app/api/codex/projects/route.js")
  const members = await import("../../../app/api/codex/projects/[id]/members/route.js")
  const section = await import("../../../app/api/codex/projects/[id]/sections/[sectionId]/route.js")
  const move = await import("../../../app/api/codex/projects/[id]/sections/[sectionId]/tasks/route.js")
  const reorder = await import("../../../app/api/codex/projects/[id]/sections/reorder/route.js")
  const complete = await import("../../../app/api/codex/projects/[id]/tasks/[taskId]/complete/route.js")
  calls.length = 0
  session = STAFF
  const results = await withSwitches(true, true, async () => [
    (await one.GET(req("GET", `${U}/x`), ctx({ id: "x" }))).status,
    (await one.PATCH(req("PATCH", `${U}/0`, { name: "A" }), ctx({ id: "0" }))).status,
    (await section.DELETE(req("DELETE", `${U}/5/sections/x`), ctx({ id: "5", sectionId: "x" }))).status,
    (await complete.POST(req("POST", `${U}/5/tasks/-1/complete`), ctx({ id: "5", taskId: "-1" }))).status,
    (await list.GET(req("GET", `${U}?status=archived`))).status,
    (await list.POST(req("POST", U, { name: "", kind: "campaign" }))).status,
    (await list.POST(new Request(U, { method: "POST", body: "{not json" }))).status,
    (await one.PATCH(req("PATCH", `${U}/5`, {}), ctx({ id: "5" }))).status,
    (await members.POST(req("POST", `${U}/5/members`, { emails: [] }), ctx({ id: "5" }))).status,
    (await members.DELETE(req("DELETE", `${U}/5/members`), ctx({ id: "5" }))).status,
    (await move.POST(req("POST", `${U}/5/sections/9/tasks`, { task_id: "x" }), ctx({ id: "5", sectionId: "9" }))).status,
    (await reorder.POST(req("POST", `${U}/5/sections/reorder`, { ordered_ids: [] }), ctx({ id: "5" }))).status,
  ])
  assert.deepEqual(results, [404, 404, 404, 404, 400, 400, 400, 400, 400, 400, 400, 400])
  assert.equal(calls.length, 0)
})

test("GET projects passes ?status through", { skip }, async () => {
  const list = await import("../../../app/api/codex/projects/route.js")
  calls.length = 0
  mode = "ok"
  session = STAFF
  const res = await withSwitches(true, true, () => list.GET(req("GET", `${U}?status=on_hold`)))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { items: [PROJECT] })
  assert.deepEqual(calls[0].args, ["luke@x.au", { status: "on_hold" }])
})

test("isCodexProjectsEnabled needs both codex_v2 and codex_projects", { skip }, async () => {
  const { isCodexProjectsEnabled } = await import("../flag.js")
  assert.equal(await withSwitches(true, true, () => isCodexProjectsEnabled()), true)
  assert.equal(await withSwitches(false, true, () => isCodexProjectsEnabled()), false)
  assert.equal(await withSwitches(true, false, () => isCodexProjectsEnabled()), false)
})
