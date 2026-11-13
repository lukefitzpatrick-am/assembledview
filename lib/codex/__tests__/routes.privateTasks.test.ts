/**
 * B42 (C-211): every single-task route answers a task in a private project
 * the viewer cannot see exactly as a missing one (404 `not_found`), before
 * the store runs; bulk refuses the batch as it does a missing id (409 "Task
 * <id> was not found."); the list, status counts, MBA counts and search pass
 * the session email as the viewer; project saved views need the project to
 * be visible (C-234). Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

const HIDDEN = 7
const MEMBER = "mia@x.au"
const OUT = "luke@x.au"
let session: null | { user: { email?: string; roles: string[] } } = null
const storeCalls: string[] = []
const viewers: Array<{ fn: string; viewer: unknown }> = []
let visibilityThrows = false
/** Project ids `getProject` answers ok for. */
const visibleProjects = new Set<number>([5])

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/auth/getCurrentUser", {
    namedExports: { getCurrentUser: async () => ({ id: 0, email: session?.user.email ?? null, name: "L", roles: ["admin"] }) },
  })
  await mock.module!("@/lib/codex/taskVisibility", {
    namedExports: {
      isTaskHiddenFrom: async (_db: unknown, id: number, viewer: string | null) => {
        if (visibilityThrows) throw new Error("db down")
        viewers.push({ fn: "isTaskHiddenFrom", viewer })
        return id === HIDDEN && viewer !== MEMBER
      },
      hiddenTaskIds: async (_db: unknown, ids: number[], viewer: string | null) => {
        viewers.push({ fn: "hiddenTaskIds", viewer })
        return new Set(ids.filter((id) => id === HIDDEN && viewer !== MEMBER))
      },
    },
  })
  const rec = (name: string, value: unknown) => async (...args: unknown[]) => {
    storeCalls.push(name)
    if (name === "listTasks" || name === "countTasksByStatus") viewers.push({ fn: name, viewer: (args[0] as { viewerEmail?: unknown }).viewerEmail })
    if (name === "countTasksByMba") viewers.push({ fn: name, viewer: args[3] })
    if (name === "getTask") viewers.push({ fn: name, viewer: args[2] })
    return value
  }
  class CodexBulkError extends Error {
    constructor(
      readonly taskId: number,
      readonly statusCode: 400 | 409,
      message: string
    ) {
      super(message)
    }
  }
  const TASK = { id: 8, title: "t", status: "todo" }
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      getTask: rec("getTask", TASK),
      updateTask: rec("updateTask", TASK),
      softDeleteTask: rec("softDeleteTask", TASK),
      listTaskActivity: rec("listTaskActivity", []),
      listChecklistItems: rec("listChecklistItems", []),
      createChecklistItem: rec("createChecklistItem", {}),
      reorderChecklistItems: rec("reorderChecklistItems", []),
      updateChecklistItem: rec("updateChecklistItem", {}),
      deleteChecklistItem: rec("deleteChecklistItem", {}),
      listComments: rec("listComments", []),
      createComment: rec("createComment", {}),
      deleteComment: rec("deleteComment", {}),
      requestHelp: rec("requestHelp", { parent: TASK, child: TASK }),
      HELP_ON_DONE_MESSAGE: "done",
      CodexBulkError,
      bulkUpdateTasks: rec("bulkUpdateTasks", []),
      bulkSoftDeleteTasks: rec("bulkSoftDeleteTasks", []),
      listTasks: rec("listTasks", { items: [], itemsTotal: 0 }),
      countTasksByStatus: rec("countTasksByStatus", {}),
      countTasksByMba: rec("countTasksByMba", []),
      createTask: rec("createTask", TASK),
      parseStatusFilter: () => undefined,
    },
  })
  await mock.module!("@/lib/fireflies/proposalRepo", {
    namedExports: { dismissAutoCreatedTask: rec("dismissAutoCreatedTask", { ok: true }) },
  })
  await mock.module!("@/lib/codex/searchRepo", {
    namedExports: {
      searchCodex: async (...args: unknown[]) => {
        viewers.push({ fn: "searchCodex", viewer: args[3] })
        return { q: "x", tasks: { items: [], more: false }, inbox: { items: [], more: false }, meetings: { items: [], more: false } }
      },
    },
  })
  await mock.module!("@/lib/codex/savedViewsRepo", {
    namedExports: {
      listSavedViews: rec("listSavedViews", []),
      createSavedView: rec("createSavedView", { id: 1 }),
      updateSavedView: async (_id: number, _email: string, _patch: unknown, _db: unknown, check?: (s: string) => Promise<boolean>) => {
        storeCalls.push("updateSavedView")
        return (await check?.("project:6")) === false ? { ok: false, reason: "not_found" } : { ok: true, view: { id: 1 } }
      },
      deleteSavedView: async (_id: number, _email: string, _db: unknown, check?: (s: string) => Promise<boolean>) => {
        storeCalls.push("deleteSavedView")
        return (await check?.("project:6")) === false ? { ok: false, reason: "not_found" } : { ok: true }
      },
      SavedViewsUnavailableError: class extends Error {},
      SavedViewsLimitError: class extends Error {},
    },
  })
  await mock.module!("@/lib/codex/taskDetailRepo", {
    namedExports: {
      getTaskProjectDetail: rec("getTaskProjectDetail", { ok: true, task: { id: 8 }, project: null, project_hidden: false, sections: [], fields: [], subtasks: [], parent: null }),
      createSubtask: rec("createSubtask", { ok: true, subtask: { id: 9 } }),
      reorderSubtasks: rec("reorderSubtasks", { ok: true, subtasks: [] }),
    },
  })
  await mock.module!("@/lib/codex/notify", {
    namedExports: { beforeTaskWrite: async () => new Map(), afterTaskWrite: async () => undefined },
  })
  await mock.module!("@/lib/codex/projectsRepo", {
    namedExports: {
      ProjectsUnavailableError: class extends Error {},
      getProject: async (id: number) => (visibleProjects.has(id) ? { ok: true, project: { id }, sections: [] } : { ok: false, reason: "not_found" }),
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withSwitches<T>(on: Record<string, boolean>, run: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(async () => new Map(Object.entries(on).map(([k, v]) => [k, row(k, v)])))
  try {
    return await run()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const T = "http://l/api/codex/tasks"
const req = (method: string, url: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const ctx = <Q extends Record<string, string>>(p: Q) => ({ params: Promise.resolve(p) })
const staff = (email: string) => ({ user: { email, roles: ["admin"] } })

async function singleTaskCalls(id: number) {
  const task = await import("../../../app/api/codex/tasks/[id]/route.js")
  const activity = await import("../../../app/api/codex/tasks/[id]/activity/route.js")
  const checklist = await import("../../../app/api/codex/tasks/[id]/checklist/route.js")
  const item = await import("../../../app/api/codex/tasks/[id]/checklist/[itemId]/route.js")
  const comments = await import("../../../app/api/codex/tasks/[id]/comments/route.js")
  const comment = await import("../../../app/api/codex/tasks/[id]/comments/[commentId]/route.js")
  const help = await import("../../../app/api/codex/tasks/[id]/help/route.js")
  const dismiss = await import("../../../app/api/codex/tasks/[id]/dismiss-auto/route.js")
  const project = await import("../../../app/api/codex/tasks/[id]/project/route.js")
  const subtasks = await import("../../../app/api/codex/tasks/[id]/subtasks/route.js")
  const reorder = await import("../../../app/api/codex/tasks/[id]/subtasks/reorder/route.js")
  const s = String(id)
  return [
    ["GET task", () => task.GET(req("GET", `${T}/${s}`), ctx({ id: s }))],
    ["PATCH task", () => task.PATCH(req("PATCH", `${T}/${s}`, { title: "x" }), ctx({ id: s }))],
    ["DELETE task", () => task.DELETE(req("DELETE", `${T}/${s}`), ctx({ id: s }))],
    ["GET activity", () => activity.GET(req("GET", `${T}/${s}/activity`), ctx({ id: s }))],
    ["GET checklist", () => checklist.GET(req("GET", `${T}/${s}/checklist`), ctx({ id: s }))],
    ["POST checklist", () => checklist.POST(req("POST", `${T}/${s}/checklist`, { label: "a" }), ctx({ id: s }))],
    ["PATCH checklist item", () => item.PATCH(req("PATCH", `${T}/${s}/checklist/3`, { done: true }), ctx({ id: s, itemId: "3" }))],
    ["DELETE checklist item", () => item.DELETE(req("DELETE", `${T}/${s}/checklist/3`), ctx({ id: s, itemId: "3" }))],
    ["GET comments", () => comments.GET(req("GET", `${T}/${s}/comments`), ctx({ id: s }))],
    ["POST comment", () => comments.POST(req("POST", `${T}/${s}/comments`, { body: "hi" }), ctx({ id: s }))],
    ["DELETE comment", () => comment.DELETE(req("DELETE", `${T}/${s}/comments/3`), ctx({ id: s, commentId: "3" }))],
    ["POST help", () => help.POST(req("POST", `${T}/${s}/help`, { assignee_email: "a@x.au", ask: "hi" }), ctx({ id: s }))],
    ["POST dismiss-auto", () => dismiss.POST(req("POST", `${T}/${s}/dismiss-auto`), ctx({ id: s }))],
    ["--projects", () => Promise.resolve(new Response())],
    ["GET task project", () => project.GET(req("GET", `${T}/${s}/project`), ctx({ id: s }))],
    ["POST subtask", () => subtasks.POST(req("POST", `${T}/${s}/subtasks`, { title: "a" }), ctx({ id: s }))],
    ["POST subtask reorder", () => reorder.POST(req("POST", `${T}/${s}/subtasks/reorder`, { ordered_ids: [1] }), ctx({ id: s }))],
  ] as Array<[string, () => Promise<Response>]>
}

const ON = { codex_v2: true, codex_projects: true, codex_saved_views: true }

/** The routes in two groups: with codex_projects off (the Stage 0 routes) and on (the B40 detail routes). */
async function eachRoute(id: number, fn: (name: string, run: () => Promise<Response>) => Promise<void>) {
  const calls = await singleTaskCalls(id)
  const cut = calls.findIndex(([n]) => n === "--projects")
  await withSwitches({ ...ON, codex_projects: false }, async () => {
    for (const [name, run] of calls.slice(0, cut)) await fn(name, run)
  })
  await withSwitches(ON, async () => {
    for (const [name, run] of calls.slice(cut + 1)) await fn(name, run)
  })
}

test("every single-task route answers a hidden task as missing, before the store", { skip }, async () => {
  session = staff(OUT)
  {
    await eachRoute(HIDDEN, async (name, run) => {
      storeCalls.length = 0
      const res = await run()
      assert.equal(res.status, 404, name)
      assert.deepEqual(await res.json(), { error: "not_found" }, name)
      assert.deepEqual(storeCalls, [], `${name}: no store call`)
    })
  }
})

test("a member, and a task not in a private project, pass the guard", { skip }, async () => {
  for (const [who, id] of [
    [MEMBER, HIDDEN],
    [OUT, 8],
  ] as const) {
    session = staff(who)
    viewers.length = 0
    let n = 0
    await eachRoute(id, async (name, run) => {
      n += 1
      const res = await run()
      assert.notEqual(res.status, 404, `${name} (${who}, ${id})`)
    })
    assert.equal(n, 16)
    const seen = viewers.filter((v) => v.fn === "isTaskHiddenFrom")
    assert.equal(seen.length, 16)
    assert.ok(seen.every((v) => v.viewer === who), "the session email is the viewer")
  }
})

test("a failed visibility check is a 500, never a pass", { skip }, async () => {
  await withSwitches({ ...ON, codex_projects: false }, async () => {
    session = staff(OUT)
    visibilityThrows = true
    try {
      storeCalls.length = 0
      const [, run] = (await singleTaskCalls(8))[0]
      const res = await run()
      assert.equal(res.status, 500)
      assert.deepEqual(storeCalls, [])
    } finally {
      visibilityThrows = false
    }
  })
})

test("bulk: a hidden id refuses the batch as a missing one does, update and delete", { skip }, async () => {
  const bulk = await import("../../../app/api/codex/tasks/bulk/route.js")
  await withSwitches(ON, async () => {
    session = staff(OUT)
    for (const body of [
      { ids: [8, HIDDEN], patch: { status: "done" } },
      { ids: [HIDDEN], action: "delete" },
    ]) {
      storeCalls.length = 0
      const res = await bulk.POST(req("POST", `${T}/bulk`, body))
      assert.equal(res.status, 409)
      assert.deepEqual(await res.json(), { error: "conflict", message: `Task ${HIDDEN} was not found.`, id: HIDDEN })
      assert.deepEqual(storeCalls, [])
    }
    session = staff(MEMBER)
    const ok = await bulk.POST(req("POST", `${T}/bulk`, { ids: [HIDDEN], patch: { priority: "high" } }))
    assert.equal(ok.status, 200)
  })
})

test("list, status counts, MBA counts and search read as the session email", { skip }, async () => {
  const list = await import("../../../app/api/codex/tasks/route.js")
  const counts = await import("../../../app/api/codex/tasks/status-counts/route.js")
  const mba = await import("../../../app/api/codex/tasks/counts/route.js")
  const search = await import("../../../app/api/codex/search/route.js")
  await withSwitches({ ...ON, codex_projects: false, codex_search: true }, async () => {
    session = staff("Luke@X.au")
    viewers.length = 0
    assert.equal((await list.GET(req("GET", `${T}?status=todo`))).status, 200)
    assert.equal((await counts.GET(req("GET", `${T}/status-counts`))).status, 200)
    assert.equal((await mba.GET(req("GET", `${T}/counts?mba=a1`))).status, 200)
    assert.equal((await search.GET(req("GET", "http://l/api/codex/search?q=zebra"))).status, 200)
    assert.deepEqual(
      viewers.map((v) => `${v.fn}:${String(v.viewer)}`),
      ["listTasks:luke@x.au", "countTasksByStatus:luke@x.au", "countTasksByMba:luke@x.au", "searchCodex:luke@x.au"]
    )
  })
})

test("saved views of a project the viewer cannot see: none listed, none saved, changed or deleted (C-234)", { skip }, async () => {
  const views = await import("../../../app/api/codex/saved-views/route.js")
  const view = await import("../../../app/api/codex/saved-views/[id]/route.js")
  const V = "http://l/api/codex/saved-views"
  const body = (screen: string) => ({ name: "Mine", screen, lens: "plan", filters: {}, layout: "list", group_by: null, shared: true })
  await withSwitches(ON, async () => {
    session = staff(OUT)
    storeCalls.length = 0
    const hidden = await views.GET(req("GET", `${V}?screen=project:6`))
    assert.deepEqual(await hidden.json(), { available: true, items: [] })
    assert.equal((await views.POST(req("POST", V, body("project:6")))).status, 404)
    assert.deepEqual(storeCalls, [], "the store never runs for a hidden project")
    assert.equal((await views.GET(req("GET", `${V}?screen=project:5`))).status, 200)
    assert.deepEqual(storeCalls, ["listSavedViews"])
    assert.equal((await view.PATCH(req("PATCH", `${V}/1`, { name: "x" }), ctx({ id: "1" }))).status, 404)
    assert.equal((await view.DELETE(req("DELETE", `${V}/1`), ctx({ id: "1" }))).status, 404)
  })
  // codex_projects off: a project view cannot be changed even by its owner
  visibleProjects.add(6)
  try {
    await withSwitches({ ...ON, codex_projects: false }, async () => {
      session = staff(OUT)
      assert.equal((await view.PATCH(req("PATCH", `${V}/1`, { name: "x" }), ctx({ id: "1" }))).status, 404)
      assert.equal((await view.DELETE(req("DELETE", `${V}/1`), ctx({ id: "1" }))).status, 404)
    })
    await withSwitches(ON, async () => {
      assert.equal((await view.PATCH(req("PATCH", `${V}/1`, { name: "x" }), ctx({ id: "1" }))).status, 200)
    })
  } finally {
    visibleProjects.delete(6)
  }
})
