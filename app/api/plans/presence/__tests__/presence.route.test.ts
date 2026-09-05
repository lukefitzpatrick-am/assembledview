/**
 * SM-7 — plan presence. Identity from draftIdentity; never "unknown".
 *
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

type SessionUser = { email?: string; name?: string; sub?: string }

let currentUser: SessionUser = { email: "a@example.com", name: "A" }

const requireRoleMock = mock.fn(async () => ({
  session: { user: currentUser },
  roles: ["admin"] as const,
  clientSlug: null,
  grantedByAllowlist: false,
}))

type Stored = {
  masterId: number
  userId: string
  userLabel: string | null
  page: "edit" | "create"
  lastSeenAt: string
}

const table = new Map<string, Stored>()
const FRESH_MS = 90_000

function rowKey(masterId: number, userId: string) {
  return `${masterId}::${userId}`
}

const upsertPlanPresenceMock = mock.fn(
  async (args: {
    masterId: number
    userId: string
    userLabel?: string | null
    page?: "edit" | "create"
    now?: Date
  }): Promise<Stored> => {
    const key = rowKey(args.masterId, args.userId)
    const row: Stored = {
      masterId: args.masterId,
      userId: args.userId,
      userLabel: args.userLabel ?? null,
      page: args.page ?? "edit",
      lastSeenAt: (args.now ?? new Date()).toISOString(),
    }
    table.set(key, row)
    return row
  }
)

const listOtherPlanPresenceMock = mock.fn(
  async (args: {
    masterId: number
    excludeUserId: string
    now?: Date
  }): Promise<Array<{ userLabel: string | null; lastSeenAt: string; page: "edit" | "create" }>> => {
    const nowMs = (args.now ?? new Date()).getTime()
    return [...table.values()]
      .filter(
        (r) =>
          r.masterId === args.masterId &&
          r.userId !== args.excludeUserId &&
          nowMs - new Date(r.lastSeenAt).getTime() <= FRESH_MS
      )
      .map((r) => ({
        userLabel: r.userLabel,
        lastSeenAt: r.lastSeenAt,
        page: r.page,
      }))
  }
)

const deletePlanPresenceMock = mock.fn(
  async (args: { masterId: number; userId: string }): Promise<void> => {
    table.delete(rowKey(args.masterId, args.userId))
  }
)

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: requireRoleMock,
    },
  })
  await mock.module!("@/lib/mediaplan/drafts/presenceStore", {
    namedExports: {
      upsertPlanPresence: upsertPlanPresenceMock,
      listOtherPlanPresence: listOtherPlanPresenceMock,
      deletePlanPresence: deletePlanPresenceMock,
    },
  })
}

type Handler = (req: NextRequest) => Promise<Response>

async function loadRoute() {
  const mod = await import("../route.js")
  const { GET, POST } = mod
  if (!GET || !POST) {
    throw new Error("presence route missing GET/POST")
  }
  return { GET: GET as Handler, POST: POST as Handler }
}

function setSession(user: SessionUser) {
  currentUser = user
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: currentUser },
    roles: ["admin"] as const,
    clientSlug: null,
    grantedByAllowlist: false,
  }))
}

function resetTable() {
  table.clear()
  upsertPlanPresenceMock.mock.resetCalls()
  listOtherPlanPresenceMock.mock.resetCalls()
  deletePlanPresenceMock.mock.resetCalls()
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/plans/presence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function getReq(masterId = 42) {
  return new NextRequest(`http://localhost/api/plans/presence?masterId=${masterId}`, {
    method: "GET",
  })
}

test("upsert then GET from a second identity returns one row (no userId)", { skip }, async () => {
  resetTable()
  const { GET, POST } = await loadRoute()

  setSession({ email: "sarah@assembledmedia.com.au", name: "Sarah Chen" })
  assert.equal((await POST(postReq({ masterId: 42 }))).status, 200)
  assert.equal(table.size, 1)
  assert.equal([...table.values()][0]?.userId, "sarah@assembledmedia.com.au")

  setSession({ email: "luke@assembledmedia.com.au", name: "Luke" })
  const getRes = await GET(getReq(42))
  assert.equal(getRes.status, 200)
  const json = (await getRes.json()) as {
    others?: Array<Record<string, unknown>>
  }
  assert.equal(json.others?.length, 1)
  assert.equal(json.others?.[0]?.userLabel, "Sarah Chen")
  assert.equal(json.others?.[0]?.userId, undefined)
})

test("a row older than 90s is not returned", { skip }, async () => {
  resetTable()
  const { GET, POST } = await loadRoute()
  const now = new Date("2026-09-05T05:00:00.000Z")

  setSession({ email: "sarah@assembledmedia.com.au", name: "Sarah Chen" })
  assert.equal(
    (
      await POST(
        postReq({
          masterId: 42,
          now: new Date(now.getTime() - 91_000).toISOString(),
        })
      )
    ).status,
    200
  )
  // The route may not forward `now`; stamp the row stale directly.
  const stored = [...table.values()][0]
  assert.ok(stored)
  stored.lastSeenAt = new Date(now.getTime() - 91_000).toISOString()

  setSession({ email: "luke@assembledmedia.com.au", name: "Luke" })
  const json = (await (await GET(getReq(42))).json()) as { others?: unknown[] }
  assert.equal((json.others ?? []).length, 0)
})

test("leaving deletes the caller's row", { skip }, async () => {
  resetTable()
  const { GET, POST } = await loadRoute()

  setSession({ email: "sarah@assembledmedia.com.au", name: "Sarah Chen" })
  assert.equal((await POST(postReq({ masterId: 42 }))).status, 200)
  assert.equal(table.size, 1)

  assert.equal((await POST(postReq({ masterId: 42, leaving: true }))).status, 200)
  assert.equal(table.size, 0)
  assert.equal(deletePlanPresenceMock.mock.calls.length, 1)

  setSession({ email: "luke@assembledmedia.com.au", name: "Luke" })
  const json = (await (await GET(getReq(42))).json()) as { others?: unknown[] }
  assert.equal((json.others ?? []).length, 0)
})

test("no identity → 401 and no row", { skip }, async () => {
  resetTable()
  setSession({})
  const { GET, POST } = await loadRoute()

  const postRes = await POST(postReq({ masterId: 42 }))
  assert.equal(postRes.status, 401)
  const postBody = (await postRes.json()) as { error?: string }
  assert.match(postBody.error ?? "", /Session identity unavailable/)
  assert.equal(upsertPlanPresenceMock.mock.calls.length, 0)
  assert.equal(deletePlanPresenceMock.mock.calls.length, 0)
  assert.equal(table.size, 0)

  const getRes = await GET(getReq(42))
  assert.equal(getRes.status, 401)
  assert.equal(listOtherPlanPresenceMock.mock.calls.length, 0)
})
