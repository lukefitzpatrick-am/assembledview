/**
 * Codex API flag + shadow-role exit gate.
 *
 * Extends the original GET /tasks flag/auth smoke into the full method×route matrix.
 * Flag-off returns 404 (not 403) on purpose — a hidden feature must not confirm it exists.
 *
 * Requires Node 22+ with `--experimental-test-module-mocks` (see package.json script).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { CODEX_SHADOW_ROLES } from "../shadowRoles.js"

const skip = mockModuleSkip()

const auth0GetSession = mock.fn(
  async () => null as null | { user: { email?: string; roles?: string[]; [k: string]: unknown } }
)

type ListTasksFilterCapture = {
  assigneeEmail?: string
  mineForEmail?: string
}

/** Captured by listTasks mock for the mine=1 route pin (do not re-mock.module). */
const listTasksCapture: { last?: ListTasksFilterCapture } = {}

const emptyPage = {
  items: [],
  itemsTotal: 0,
  curPage: 1,
  pageTotal: 1,
  nextPage: null,
  prevPage: null,
}

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
      listTasks: async (filters: {
        assigneeEmail?: string
        mineForEmail?: string
      }) => {
        listTasksCapture.last = {
          assigneeEmail: filters.assigneeEmail,
          mineForEmail: filters.mineForEmail,
        }
        return emptyPage
      },
      parseStatusFilter: () => undefined,
      createTask: async () => ({ id: 1, title: "t", client_id: 1, status: "todo" }),
      updateTask: async () => null,
      softDeleteTask: async () => false,
      listTeamMembers: async () => emptyPage,
      createTeamMember: async () => ({
        id: 1,
        email: "a@example.com",
        name: "A",
        role_title: null,
        active: true,
        capacity_notes: null,
        working_style: null,
        default_client_ids: [],
        created_at: "",
        updated_at: "",
      }),
      updateTeamMember: async () => null,
      listClientNotes: async () => emptyPage,
    },
  })
}

type SessionKind = "none" | "client" | "admin"

function setSession(kind: SessionKind) {
  auth0GetSession.mock.resetCalls()
  if (kind === "none") {
    auth0GetSession.mock.mockImplementation(async () => null)
    return
  }
  if (kind === "client") {
    auth0GetSession.mock.mockImplementation(async () => ({
      user: { email: "client@example.com", roles: ["client"] },
    }))
    return
  }
  auth0GetSession.mock.mockImplementation(async () => ({
    user: { email: "admin@example.com", roles: ["admin"] },
  }))
}

async function withCodexFlagOff<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.CODEX_V2
  delete process.env.CODEX_V2
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.CODEX_V2
    else process.env.CODEX_V2 = prev
  }
}

async function withCodexFlagOn<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.CODEX_V2
  process.env.CODEX_V2 = "on"
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.CODEX_V2
    else process.env.CODEX_V2 = prev
  }
}

async function jsonBody(res: Response): Promise<unknown> {
  return res.json()
}

type RouteCaller = {
  label: string
  invoke: () => Promise<Response>
}

async function loadRouteCallers(): Promise<RouteCaller[]> {
  const tasks = await import("../../../app/api/codex/tasks/route.js")
  const taskById = await import("../../../app/api/codex/tasks/[id]/route.js")
  const team = await import("../../../app/api/codex/team/route.js")
  const teamById = await import("../../../app/api/codex/team/[id]/route.js")
  const notes = await import("../../../app/api/codex/client_notes/route.js")

  const taskIdCtx = { params: Promise.resolve({ id: "1" }) }
  const teamIdCtx = { params: Promise.resolve({ id: "1" }) }

  return [
    {
      label: "GET /api/codex/tasks",
      invoke: () => tasks.GET(new Request("http://localhost/api/codex/tasks")),
    },
    {
      label: "POST /api/codex/tasks",
      invoke: () =>
        tasks.POST(
          new Request("http://localhost/api/codex/tasks", { method: "POST" })
        ),
    },
    {
      label: "PATCH /api/codex/tasks/[id]",
      invoke: () =>
        taskById.PATCH(
          new Request("http://localhost/api/codex/tasks/1", {
            method: "PATCH",
          }),
          taskIdCtx
        ),
    },
    {
      label: "DELETE /api/codex/tasks/[id]",
      invoke: () =>
        taskById.DELETE(
          new Request("http://localhost/api/codex/tasks/1", {
            method: "DELETE",
          }),
          taskIdCtx
        ),
    },
    {
      label: "GET /api/codex/team",
      invoke: () => team.GET(new Request("http://localhost/api/codex/team")),
    },
    {
      label: "POST /api/codex/team",
      invoke: () =>
        team.POST(
          new Request("http://localhost/api/codex/team", { method: "POST" })
        ),
    },
    {
      label: "PATCH /api/codex/team/[id]",
      invoke: () =>
        teamById.PATCH(
          new Request("http://localhost/api/codex/team/1", {
            method: "PATCH",
          }),
          teamIdCtx
        ),
    },
    {
      label: "GET /api/codex/client_notes",
      invoke: () =>
        notes.GET(new Request("http://localhost/api/codex/client_notes")),
    },
  ]
}

test(
  "CODEX_SHADOW_ROLES is exactly [admin] (pin — fail loudly if widened)",
  () => {
    assert.deepEqual([...CODEX_SHADOW_ROLES], ["admin"])
  }
)

test(
  "Codex routes: flag off → 404 not_found; flag on → 401/403/not-auth by role",
  { skip },
  async () => {
    const callers = await loadRouteCallers()
    assert.equal(callers.length, 8)

    for (const route of callers) {
      // Flag off: deliberately 404 (not 403). Hidden feature must not confirm it exists.
      await withCodexFlagOff(async () => {
        setSession("admin")
        const res = await route.invoke()
        assert.equal(
          res.status,
          404,
          `${route.label} flag-off status (must stay 404, not 403)`
        )
        assert.deepEqual(await jsonBody(res), { error: "not_found" })
      })

      await withCodexFlagOn(async () => {
        setSession("none")
        const unauth = await route.invoke()
        assert.equal(unauth.status, 401, `${route.label} no-session status`)
        assert.deepEqual(await jsonBody(unauth), { error: "unauthorised" })

        setSession("client")
        const forbidden = await route.invoke()
        assert.equal(forbidden.status, 403, `${route.label} client status`)
        assert.deepEqual(await jsonBody(forbidden), { error: "forbidden" })

        setSession("admin")
        const admin = await route.invoke()
        assert.notEqual(
          admin.status,
          401,
          `${route.label} admin must not be 401 (got ${admin.status})`
        )
        assert.notEqual(
          admin.status,
          403,
          `${route.label} admin must not be 403 (got ${admin.status})`
        )
      })
    }
  }
)

test(
  "GET /api/codex/tasks mine=1 ignores client-supplied assignee_email",
  { skip },
  async () => {
    await withCodexFlagOn(async () => {
      setSession("admin")
      const { GET } = await import("../../../app/api/codex/tasks/route.js")
      const res = await GET(
        new Request(
          "http://localhost/api/codex/tasks?mine=1&assignee_email=other@evil.com"
        )
      )
      assert.equal(res.status, 200)
      assert.deepEqual(
        {
          mineForEmail: listTasksCapture.last?.mineForEmail,
          assigneeEmail: listTasksCapture.last?.assigneeEmail,
        },
        {
          mineForEmail: "admin@example.com",
          assigneeEmail: undefined,
        }
      )
    })
  }
)
