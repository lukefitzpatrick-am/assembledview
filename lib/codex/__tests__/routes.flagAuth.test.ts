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
      getTask: async () => ({ id: 1, title: "t", client_id: 1, status: "todo" }),
      updateTask: async () => null,
      softDeleteTask: async () => false,
      listTaskActivity: async () => [],
      countTasksByMba: async () => [],
      listTeamMembers: async () => emptyPage,
      listRosterLoginRows: async () => [],
      listEmailAliasCollisions: async () => [],
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
      listChecklistItems: async () => [],
      createChecklistItem: async () => null,
      updateChecklistItem: async () => null,
      deleteChecklistItem: async () => false,
      reorderChecklistItems: async () => null,
      listComments: async () => [],
      createComment: async () => null,
      deleteComment: async () => false,
      listTemplates: async () => emptyPage,
      createTemplate: async () => ({
        id: 1,
        name: "t",
        description: null,
        created_at: "",
        items: [],
      }),
      getTemplate: async () => null,
      updateTemplate: async () => null,
      deleteTemplate: async () => false,
      listTemplateItems: async () => [],
      createTemplateItem: async () => null,
      updateTemplateItem: async () => null,
      deleteTemplateItem: async () => false,
      reorderTemplateItems: async () => null,
    },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      readPlanMasters: async () => [],
    },
  })
  await mock.module!("@/lib/myhours/timeSummary", {
    namedExports: {
      getMbaTimeSummary: async () => ({
        mba_number: "test001",
        total_hours: 0,
        total_minutes: 0,
        by_member: [],
        sparkline_weeks: [0, 0, 0, 0],
        week_starts: [],
      }),
      getTeamWeekTimeSummary: async () => ({
        week_start: "2025-08-04",
        week_end: "2025-08-10",
        unmapped_count: 0,
        members: [],
      }),
    },
  })
  await mock.module!("@/lib/api/auth0Management", {
    namedExports: {
      listAllAuth0UsersUnpaged: async () => [],
      isAuth0ManagementClientConfigured: () => false,
    },
  })
  await mock.module!("@/lib/codex/rosterLoginCheck", {
    namedExports: {
      rosterEmailsNeverLoggedIn: () => [],
    },
  })
  await mock.module!("@/lib/fireflies/proposalRepo", {
    namedExports: {
      listProposedInbox: async () => ({ groups: [] }),
      batchAcceptForNote: async () => ({
        accepted: 0,
        failed: [],
        taskIds: [],
      }),
      acceptProposal: async () => ({
        ok: true,
        taskId: 1,
        possibleDuplicate: false,
      }),
      dismissProposal: async () => ({ ok: true }),
      dismissAllProposedForNote: async () => ({ ok: true, dismissed: 0 }),
      dismissAutoCreatedTask: async () => ({ ok: true }),
    },
  })
  await mock.module!("server-only", {
    namedExports: {},
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
  const checklist = await import(
    "../../../app/api/codex/tasks/[id]/checklist/route.js"
  )
  const checklistItem = await import(
    "../../../app/api/codex/tasks/[id]/checklist/[itemId]/route.js"
  )
  const comments = await import(
    "../../../app/api/codex/tasks/[id]/comments/route.js"
  )
  const commentById = await import(
    "../../../app/api/codex/tasks/[id]/comments/[commentId]/route.js"
  )
  const activity = await import(
    "../../../app/api/codex/tasks/[id]/activity/route.js"
  )
  const taskCounts = await import(
    "../../../app/api/codex/tasks/counts/route.js"
  )
  const clientMbas = await import(
    "../../../app/api/codex/client-mbas/route.js"
  )
  const team = await import("../../../app/api/codex/team/route.js")
  const teamById = await import("../../../app/api/codex/team/[id]/route.js")
  const notes = await import("../../../app/api/codex/client_notes/route.js")
  const templates = await import("../../../app/api/codex/templates/route.js")
  const templateById = await import(
    "../../../app/api/codex/templates/[id]/route.js"
  )
  const templateItems = await import(
    "../../../app/api/codex/templates/[id]/items/route.js"
  )
  const templateItemById = await import(
    "../../../app/api/codex/templates/[id]/items/[itemId]/route.js"
  )
  const timeSummary = await import(
    "../../../app/api/codex/time/summary/route.js"
  )
  const timeTeamWeek = await import(
    "../../../app/api/codex/time/team-week/route.js"
  )
  const dismissAuto = await import(
    "../../../app/api/codex/tasks/[id]/dismiss-auto/route.js"
  )
  const proposals = await import("../../../app/api/codex/proposals/route.js")
  const proposalAccept = await import(
    "../../../app/api/codex/proposals/[id]/accept/route.js"
  )
  const proposalDismiss = await import(
    "../../../app/api/codex/proposals/[id]/dismiss/route.js"
  )
  const proposalDismissAll = await import(
    "../../../app/api/codex/proposals/dismiss-all/route.js"
  )

  const taskIdCtx = { params: Promise.resolve({ id: "1" }) }
  const checklistItemCtx = {
    params: Promise.resolve({ id: "1", itemId: "1" }),
  }
  const commentCtx = {
    params: Promise.resolve({ id: "1", commentId: "1" }),
  }
  const teamIdCtx = { params: Promise.resolve({ id: "1" }) }
  const templateIdCtx = { params: Promise.resolve({ id: "1" }) }
  const templateItemCtx = {
    params: Promise.resolve({ id: "1", itemId: "1" }),
  }
  const proposalIdCtx = { params: Promise.resolve({ id: "1" }) }

  return [
    {
      label: "GET /api/codex/tasks",
      invoke: () => tasks.GET(new Request("http://localhost/api/codex/tasks")),
    },
    {
      label: "GET /api/codex/tasks/counts",
      invoke: () =>
        taskCounts.GET(
          new Request("http://localhost/api/codex/tasks/counts?mba=TEST001")
        ),
    },
    {
      label: "GET /api/codex/client-mbas",
      invoke: () =>
        clientMbas.GET(
          new Request("http://localhost/api/codex/client-mbas?client_id=1")
        ),
    },
    {
      label: "POST /api/codex/tasks",
      invoke: () =>
        tasks.POST(
          new Request("http://localhost/api/codex/tasks", { method: "POST" })
        ),
    },
    {
      label: "GET /api/codex/tasks/[id]",
      invoke: () =>
        taskById.GET(
          new Request("http://localhost/api/codex/tasks/1"),
          taskIdCtx
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
      label: "POST /api/codex/tasks/[id]/dismiss-auto",
      invoke: () =>
        dismissAuto.POST(
          new Request("http://localhost/api/codex/tasks/1/dismiss-auto", {
            method: "POST",
          }),
          taskIdCtx
        ),
    },
    {
      label: "GET /api/codex/tasks/[id]/checklist",
      invoke: () =>
        checklist.GET(
          new Request("http://localhost/api/codex/tasks/1/checklist"),
          taskIdCtx
        ),
    },
    {
      label: "POST /api/codex/tasks/[id]/checklist",
      invoke: () =>
        checklist.POST(
          new Request("http://localhost/api/codex/tasks/1/checklist", {
            method: "POST",
          }),
          taskIdCtx
        ),
    },
    {
      label: "PATCH /api/codex/tasks/[id]/checklist/[itemId]",
      invoke: () =>
        checklistItem.PATCH(
          new Request("http://localhost/api/codex/tasks/1/checklist/1", {
            method: "PATCH",
          }),
          checklistItemCtx
        ),
    },
    {
      label: "DELETE /api/codex/tasks/[id]/checklist/[itemId]",
      invoke: () =>
        checklistItem.DELETE(
          new Request("http://localhost/api/codex/tasks/1/checklist/1", {
            method: "DELETE",
          }),
          checklistItemCtx
        ),
    },
    {
      label: "GET /api/codex/tasks/[id]/comments",
      invoke: () =>
        comments.GET(
          new Request("http://localhost/api/codex/tasks/1/comments"),
          taskIdCtx
        ),
    },
    {
      label: "POST /api/codex/tasks/[id]/comments",
      invoke: () =>
        comments.POST(
          new Request("http://localhost/api/codex/tasks/1/comments", {
            method: "POST",
          }),
          taskIdCtx
        ),
    },
    {
      label: "DELETE /api/codex/tasks/[id]/comments/[commentId]",
      invoke: () =>
        commentById.DELETE(
          new Request("http://localhost/api/codex/tasks/1/comments/1", {
            method: "DELETE",
          }),
          commentCtx
        ),
    },
    {
      label: "GET /api/codex/tasks/[id]/activity",
      invoke: () =>
        activity.GET(
          new Request("http://localhost/api/codex/tasks/1/activity"),
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
    {
      label: "GET /api/codex/templates",
      invoke: () =>
        templates.GET(new Request("http://localhost/api/codex/templates")),
    },
    {
      label: "POST /api/codex/templates",
      invoke: () =>
        templates.POST(
          new Request("http://localhost/api/codex/templates", {
            method: "POST",
          })
        ),
    },
    {
      label: "GET /api/codex/templates/[id]",
      invoke: () =>
        templateById.GET(
          new Request("http://localhost/api/codex/templates/1"),
          templateIdCtx
        ),
    },
    {
      label: "PATCH /api/codex/templates/[id]",
      invoke: () =>
        templateById.PATCH(
          new Request("http://localhost/api/codex/templates/1", {
            method: "PATCH",
          }),
          templateIdCtx
        ),
    },
    {
      label: "DELETE /api/codex/templates/[id]",
      invoke: () =>
        templateById.DELETE(
          new Request("http://localhost/api/codex/templates/1", {
            method: "DELETE",
          }),
          templateIdCtx
        ),
    },
    {
      label: "GET /api/codex/templates/[id]/items",
      invoke: () =>
        templateItems.GET(
          new Request("http://localhost/api/codex/templates/1/items"),
          templateIdCtx
        ),
    },
    {
      label: "POST /api/codex/templates/[id]/items",
      invoke: () =>
        templateItems.POST(
          new Request("http://localhost/api/codex/templates/1/items", {
            method: "POST",
          }),
          templateIdCtx
        ),
    },
    {
      label: "PATCH /api/codex/templates/[id]/items/[itemId]",
      invoke: () =>
        templateItemById.PATCH(
          new Request("http://localhost/api/codex/templates/1/items/1", {
            method: "PATCH",
          }),
          templateItemCtx
        ),
    },
    {
      label: "DELETE /api/codex/templates/[id]/items/[itemId]",
      invoke: () =>
        templateItemById.DELETE(
          new Request("http://localhost/api/codex/templates/1/items/1", {
            method: "DELETE",
          }),
          templateItemCtx
        ),
    },
    {
      label: "GET /api/codex/time/summary",
      invoke: () =>
        timeSummary.GET(
          new Request("http://localhost/api/codex/time/summary?mba=TEST001")
        ),
    },
    {
      label: "GET /api/codex/time/team-week",
      invoke: () =>
        timeTeamWeek.GET(
          new Request("http://localhost/api/codex/time/team-week")
        ),
    },
    {
      label: "GET /api/codex/proposals",
      invoke: () =>
        proposals.GET(new Request("http://localhost/api/codex/proposals")),
    },
    {
      label: "POST /api/codex/proposals",
      invoke: () =>
        proposals.POST(
          new Request("http://localhost/api/codex/proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note_id: 1 }),
          })
        ),
    },
    {
      label: "POST /api/codex/proposals/[id]/accept",
      invoke: () =>
        proposalAccept.POST(
          new Request("http://localhost/api/codex/proposals/1/accept", {
            method: "POST",
          }),
          proposalIdCtx
        ),
    },
    {
      label: "POST /api/codex/proposals/[id]/dismiss",
      invoke: () =>
        proposalDismiss.POST(
          new Request("http://localhost/api/codex/proposals/1/dismiss", {
            method: "POST",
          }),
          proposalIdCtx
        ),
    },
    {
      label: "POST /api/codex/proposals/dismiss-all",
      invoke: () =>
        proposalDismissAll.POST(
          new Request("http://localhost/api/codex/proposals/dismiss-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note_id: 1 }),
          })
        ),
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
    assert.equal(callers.length, 36)

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
