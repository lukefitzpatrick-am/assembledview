import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const auth0GetSession = mock.fn(async () => null as null | { user: { email?: string; [k: string]: unknown } })

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: auth0GetSession },
    },
  })
  await mock.module!("@/lib/rbac", {
    namedExports: {
      getUserRoles: (user: { roles?: string[] }) => user.roles ?? [],
    },
  })
  await mock.module!("@/lib/auth/getCurrentUser", {
    namedExports: {
      getCurrentUser: async () => ({
        id: 0,
        email: "admin@example.com",
        name: "Admin",
      }),
    },
  })
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      listTasks: async () => ({
        items: [],
        itemsTotal: 0,
        curPage: 1,
        pageTotal: 1,
        nextPage: null,
        prevPage: null,
      }),
      parseStatusFilter: () => undefined,
      createTask: async () => ({ id: 1, title: "t", client_id: 1, status: "todo" }),
      updateTask: async () => null,
      softDeleteTask: async () => false,
      listClientNotes: async () => ({
        items: [],
        itemsTotal: 0,
        curPage: 1,
        pageTotal: 1,
        nextPage: null,
        prevPage: null,
      }),
    },
  })
}

test("GET /api/codex/tasks returns 404 when CODEX_V2 off", { skip }, async () => {
  const prev = process.env.CODEX_V2
  delete process.env.CODEX_V2
  const { GET } = await import("../../../app/api/codex/tasks/route.js")
  const res = await GET(new Request("http://localhost/api/codex/tasks"))
  assert.equal(res.status, 404)
  if (prev === undefined) delete process.env.CODEX_V2
  else process.env.CODEX_V2 = prev
})

test("GET /api/codex/tasks returns 401 with no session when flag on", { skip }, async () => {
  const prev = process.env.CODEX_V2
  process.env.CODEX_V2 = "on"
  auth0GetSession.mock.resetCalls()
  auth0GetSession.mock.mockImplementation(async () => null)
  const { GET } = await import("../../../app/api/codex/tasks/route.js")
  const res = await GET(new Request("http://localhost/api/codex/tasks"))
  assert.equal(res.status, 401)
  if (prev === undefined) delete process.env.CODEX_V2
  else process.env.CODEX_V2 = prev
})

test("GET /api/codex/tasks returns 403 for client role", { skip }, async () => {
  const prev = process.env.CODEX_V2
  process.env.CODEX_V2 = "on"
  auth0GetSession.mock.resetCalls()
  auth0GetSession.mock.mockImplementation(async () => ({
    user: { email: "client@example.com", roles: ["client"] },
  }))
  const { GET } = await import("../../../app/api/codex/tasks/route.js")
  const res = await GET(new Request("http://localhost/api/codex/tasks"))
  assert.equal(res.status, 403)
  if (prev === undefined) delete process.env.CODEX_V2
  else process.env.CODEX_V2 = prev
})

test("mine=1 ignores client-supplied assignee_email", { skip }, async () => {
  const prev = process.env.CODEX_V2
  process.env.CODEX_V2 = "on"
  auth0GetSession.mock.resetCalls()
  auth0GetSession.mock.mockImplementation(async () => ({
    user: { email: "admin@example.com", roles: ["admin"] },
  }))

  let seenMine: string | undefined
  let seenAssignee: string | undefined
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      listTasks: async (filters: {
        assigneeEmail?: string
        mineForEmail?: string
      }) => {
        seenMine = filters.mineForEmail
        seenAssignee = filters.assigneeEmail
        return {
          items: [],
          itemsTotal: 0,
          curPage: 1,
          pageTotal: 1,
          nextPage: null,
          prevPage: null,
        }
      },
      parseStatusFilter: () => undefined,
      createTask: async () => ({ id: 1, title: "t", client_id: 1, status: "todo" }),
    },
  })
  const { GET } = await import("../../../app/api/codex/tasks/route.js")
  const res = await GET(
    new Request(
      "http://localhost/api/codex/tasks?mine=1&assignee_email=other@evil.com"
    )
  )
  assert.equal(res.status, 200)
  assert.equal(seenMine, "admin@example.com")
  assert.equal(seenAssignee, undefined)
  if (prev === undefined) delete process.env.CODEX_V2
  else process.env.CODEX_V2 = prev
})
