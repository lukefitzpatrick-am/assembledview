/**
 * Codex Stage 0 hardening — client_id exists-check + assignee_email route passthrough.
 * Requires Node 22+ `--experimental-test-module-mocks` (same as flagAuth suite).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const auth0GetSession = mock.fn(
  async () =>
    ({
      user: { email: "admin@example.com", roles: ["admin"] },
    }) as { user: { email?: string; roles?: string[]; [k: string]: unknown } }
)

const createTaskCalls: unknown[] = []
const createTeamMemberCalls: unknown[] = []
const updateTaskCalls: { id: number; patch: Record<string, unknown> }[] = []
let clientExistsResult = true
const clientExistsCalls: number[] = []

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
  await mock.module!("@/lib/codex/clientExists", {
    namedExports: {
      codexClientExists: async (clientId: number) => {
        clientExistsCalls.push(clientId)
        return clientExistsResult
      },
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
      getTask: async () => ({ id: 1, title: "t", client_id: 2, status: "todo" }),
      listTaskActivity: async () => [],
      createTask: async (input: unknown) => {
        createTaskCalls.push(input)
        return { id: 99, title: "t", client_id: 2, status: "todo" }
      },
      updateTask: async (id: number, patch: Record<string, unknown>) => {
        updateTaskCalls.push({ id, patch })
        return { id, title: "t", client_id: 2, status: "todo", ...patch }
      },
      softDeleteTask: async () => false,
      createTeamMember: async (input: unknown) => {
        createTeamMemberCalls.push(input)
        return {
          id: 7,
          email: "new@example.com",
          name: "New",
          role_title: null,
          active: true,
          capacity_notes: null,
          working_style: null,
          default_client_ids: [],
          created_at: "",
          updated_at: "",
        }
      },
      listTeamMembers: async () => ({
        items: [],
        itemsTotal: 0,
        curPage: 1,
        pageTotal: 1,
        nextPage: null,
        prevPage: null,
      }),
      listRosterLoginRows: async () => [],
      updateTeamMember: async () => null,
    },
  })
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

test(
  "POST /api/codex/tasks with non-existent client_id → 400, createTask never called",
  { skip },
  async () => {
    createTaskCalls.length = 0
    clientExistsCalls.length = 0
    clientExistsResult = false

    await withCodexFlagOn(async () => {
      const { POST } = await import("../../../app/api/codex/tasks/route.js")
      const res = await POST(
        new Request("http://localhost/api/codex/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Orphan client probe",
            client_id: 8,
          }),
        })
      )
      assert.equal(res.status, 400)
      const body = (await res.json()) as { error?: string; message?: string }
      assert.equal(body.error, "bad_request")
      assert.match(String(body.message), /client_id 8 does not exist/i)
      assert.deepEqual(clientExistsCalls, [8])
      assert.equal(createTaskCalls.length, 0, "no row must be written")
    })
  }
)

test(
  "PATCH assignee_email passes raw mixed-case string to repo (repo is sole normaliser)",
  { skip },
  async () => {
    updateTaskCalls.length = 0
    clientExistsResult = true

    await withCodexFlagOn(async () => {
      const { PATCH } = await import("../../../app/api/codex/tasks/[id]/route.js")
      const mixed = "Luke.Fitzpatrick@AssembledMedia.com.au"
      const res = await PATCH(
        new Request("http://localhost/api/codex/tasks/1", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assignee_email: mixed }),
        }),
        { params: Promise.resolve({ id: "1" }) }
      )
      assert.equal(res.status, 200)
      assert.equal(updateTaskCalls.length, 1)
      assert.equal(updateTaskCalls[0]?.patch.assigneeEmail, mixed)
      assert.notEqual(
        updateTaskCalls[0]?.patch.assigneeEmail,
        mixed.toLowerCase(),
        "route must not lowercase — repo does"
      )
    })
  }
)

test(
  "PATCH client_id that does not exist → 400, updateTask never called",
  { skip },
  async () => {
    updateTaskCalls.length = 0
    clientExistsCalls.length = 0
    clientExistsResult = false

    await withCodexFlagOn(async () => {
      const { PATCH } = await import("../../../app/api/codex/tasks/[id]/route.js")
      const res = await PATCH(
        new Request("http://localhost/api/codex/tasks/1", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_id: 8 }),
        }),
        { params: Promise.resolve({ id: "1" }) }
      )
      assert.equal(res.status, 400)
      const body = (await res.json()) as { error?: string; message?: string }
      assert.equal(body.error, "bad_request")
      assert.match(String(body.message), /client_id 8 does not exist/i)
      assert.equal(updateTaskCalls.length, 0)
    })
  }
)

test(
  "POST /api/codex/team with name+email → 201 and createTeamMember called",
  { skip },
  async () => {
    createTeamMemberCalls.length = 0
    auth0GetSession.mock.resetCalls()
    auth0GetSession.mock.mockImplementation(async () => ({
      user: { email: "admin@example.com", roles: ["admin"] },
    }))

    await withCodexFlagOn(async () => {
      const { POST } = await import("../../../app/api/codex/team/route.js")
      const res = await POST(
        new Request("http://localhost/api/codex/team", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "New Member",
            email: "new@assembledmedia.com.au",
            role_title: "AM",
            active: true,
            capacity_notes: "notes",
            working_style: "async",
          }),
        })
      )
      assert.equal(res.status, 201)
      assert.equal(createTeamMemberCalls.length, 1)
      assert.deepEqual(createTeamMemberCalls[0], {
        email: "new@assembledmedia.com.au",
        name: "New Member",
        roleTitle: "AM",
        active: true,
        capacityNotes: "notes",
        workingStyle: "async",
        defaultClientIds: undefined,
      })
    })
  }
)

test(
  "POST /api/codex/team missing name → 400, createTeamMember never called",
  { skip },
  async () => {
    createTeamMemberCalls.length = 0
    auth0GetSession.mock.resetCalls()
    auth0GetSession.mock.mockImplementation(async () => ({
      user: { email: "admin@example.com", roles: ["admin"] },
    }))

    await withCodexFlagOn(async () => {
      const { POST } = await import("../../../app/api/codex/team/route.js")
      const res = await POST(
        new Request("http://localhost/api/codex/team", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "only@example.com" }),
        })
      )
      assert.equal(res.status, 400)
      assert.equal(createTeamMemberCalls.length, 0)
    })
  }
)
