/**
 * SF-2 — draft identity never falls back to a shared "unknown" user.
 *
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import type { PlanDraftStateV1, PlanWorkingDraftRow } from "../../../../../lib/mediaplan/drafts/types"

const skip = mockModuleSkip()

type SessionUser = { email?: string; name?: string; sub?: string }

let currentUser: SessionUser = { email: "a@example.com" }

const requireRoleMock = mock.fn(async () => ({
  session: { user: currentUser },
  roles: ["admin"] as const,
  clientSlug: null,
  grantedByAllowlist: false,
}))

type Stored = PlanWorkingDraftRow
const table = new Map<string, Stored>()
let nextId = 1

function rowKey(masterId: number, userId: string) {
  return `${masterId}::${userId}`
}

const upsertWorkingDraftMock = mock.fn(
  async (args: {
    masterId: number
    userId: string
    userLabel?: string | null
    baseVersionId: number | null
    state: PlanDraftStateV1
  }): Promise<Stored> => {
    const key = rowKey(args.masterId, args.userId)
    const existing = table.get(key)
    const row: Stored = {
      id: existing?.id ?? nextId++,
      masterId: args.masterId,
      userId: args.userId,
      userLabel: args.userLabel ?? null,
      baseVersionId: args.baseVersionId,
      draftStateJson: args.state,
      updatedAt: new Date().toISOString(),
    }
    table.set(key, row)
    return row
  }
)

const getWorkingDraftMock = mock.fn(
  async (args: { masterId: number; userId: string }): Promise<Stored | null> =>
    table.get(rowKey(args.masterId, args.userId)) ?? null
)

const listOtherWorkingDraftsMock = mock.fn(
  async (args: { masterId: number; excludeUserId: string }): Promise<Stored[]> =>
    [...table.values()].filter(
      (r) => r.masterId === args.masterId && r.userId !== args.excludeUserId
    )
)

const deleteWorkingDraftMock = mock.fn(
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
  await mock.module!("@/lib/mediaplan/drafts/flag", {
    namedExports: {
      isPlanDraftsEnabled: () => true,
    },
  })
  await mock.module!("@/lib/mediaplan/drafts/serverStore", {
    namedExports: {
      upsertWorkingDraft: upsertWorkingDraftMock,
      getWorkingDraft: getWorkingDraftMock,
      listOtherWorkingDrafts: listOtherWorkingDraftsMock,
      deleteWorkingDraft: deleteWorkingDraftMock,
      nudgeStaleDrafts: async () => 0,
    },
  })
}

type DraftHandler = (req: NextRequest) => Promise<Response>

async function loadRoute() {
  const mod = await import("../route.js")
  const { GET, PUT, DELETE } = mod
  if (!GET || !PUT || !DELETE) {
    throw new Error("drafts route missing GET/PUT/DELETE")
  }
  return {
    GET: GET as DraftHandler,
    PUT: PUT as DraftHandler,
    DELETE: DELETE as DraftHandler,
  }
}

const STATE: PlanDraftStateV1 = {
  v: 1,
  mbaNumber: "TEST001",
  masterId: 42,
  baseVersionId: 7,
  formValues: {},
  channels: {},
  meta: { lineCount: 0, budgetCents: 0 },
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
  nextId = 1
  upsertWorkingDraftMock.mock.resetCalls()
  getWorkingDraftMock.mock.resetCalls()
  listOtherWorkingDraftsMock.mock.resetCalls()
  deleteWorkingDraftMock.mock.resetCalls()
}

function putReq(masterId = 42) {
  return new NextRequest("http://localhost/api/plans/drafts", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ masterId, baseVersionId: 7, state: STATE }),
  })
}

function getReq(masterId = 42) {
  return new NextRequest(`http://localhost/api/plans/drafts?masterId=${masterId}`, {
    method: "GET",
  })
}

function deleteReq(masterId = 42) {
  return new NextRequest(`http://localhost/api/plans/drafts?masterId=${masterId}`, {
    method: "DELETE",
  })
}

test("session with email → row keyed on the email", { skip }, async () => {
  resetTable()
  setSession({ email: "luke@assembledmedia.com.au", name: "Luke" })
  const { PUT, GET } = await loadRoute()
  const putRes = await PUT(putReq())
  assert.equal(putRes.status, 200)
  assert.equal(table.size, 1)
  const stored = [...table.values()][0]
  assert.equal(stored.userId, "luke@assembledmedia.com.au")

  const getRes = await GET(getReq())
  assert.equal(getRes.status, 200)
  const json = (await getRes.json()) as {
    identity?: { source: string; id: string }
    draft?: { userId: string } | null
  }
  assert.deepEqual(json.identity, {
    source: "email",
    id: "luke@assembledmedia.com.au",
  })
  assert.equal(json.draft?.userId, "luke@assembledmedia.com.au")
})

test("session with sub only → row keyed on the sub, warning logged", { skip }, async () => {
  resetTable()
  setSession({ sub: "auth0|sub-only-1", name: "No Email" })
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "))
  }
  try {
    const { PUT, GET } = await loadRoute()
    const putRes = await PUT(putReq())
    assert.equal(putRes.status, 200)
    assert.equal([...table.values()][0]?.userId, "auth0|sub-only-1")
    assert.ok(
      warnings.some((w) => /\/api\/plans\/drafts/.test(w)),
      `expected a warning naming the route, got: ${warnings.join(" | ")}`
    )

    const getRes = await GET(getReq())
    const json = (await getRes.json()) as {
      identity?: { source: string; id: string }
    }
    assert.deepEqual(json.identity, { source: "sub", id: "auth0|sub-only-1" })
  } finally {
    console.warn = warn
  }
})

test("session with neither → 401, and NO row written", { skip }, async () => {
  resetTable()
  setSession({})
  const { PUT, GET, DELETE } = await loadRoute()

  const putRes = await PUT(putReq())
  assert.equal(putRes.status, 401)
  const putBody = (await putRes.json()) as { error?: string }
  assert.match(putBody.error ?? "", /Session identity unavailable/)
  assert.equal(upsertWorkingDraftMock.mock.calls.length, 0)
  assert.equal(table.size, 0)

  const getRes = await GET(getReq())
  assert.equal(getRes.status, 401)
  assert.equal(getWorkingDraftMock.mock.calls.length, 0)

  const delRes = await DELETE(deleteReq())
  assert.equal(delRes.status, 401)
  assert.equal(deleteWorkingDraftMock.mock.calls.length, 0)
})

test("two identities on the same masterId → two rows; GET returns only own draft", { skip }, async () => {
  resetTable()
  const { PUT, GET } = await loadRoute()

  setSession({ email: "alice@assembledmedia.com.au" })
  assert.equal((await PUT(putReq(42))).status, 200)

  setSession({ email: "bob@assembledmedia.com.au" })
  assert.equal((await PUT(putReq(42))).status, 200)

  assert.equal(table.size, 2)

  setSession({ email: "alice@assembledmedia.com.au" })
  const alice = (await (await GET(getReq(42))).json()) as {
    draft?: { userId: string } | null
    others?: Array<{ userId: string }>
    identity?: { id: string }
  }
  assert.equal(alice.identity?.id, "alice@assembledmedia.com.au")
  assert.equal(alice.draft?.userId, "alice@assembledmedia.com.au")
  assert.deepEqual(
    (alice.others ?? []).map((o) => o.userId),
    ["bob@assembledmedia.com.au"]
  )

  setSession({ email: "bob@assembledmedia.com.au" })
  const bob = (await (await GET(getReq(42))).json()) as {
    draft?: { userId: string } | null
    others?: Array<{ userId: string }>
  }
  assert.equal(bob.draft?.userId, "bob@assembledmedia.com.au")
  assert.deepEqual(
    (bob.others ?? []).map((o) => o.userId),
    ["alice@assembledmedia.com.au"]
  )
})

test("DELETE removes only the caller's row", { skip }, async () => {
  resetTable()
  const { PUT, GET, DELETE } = await loadRoute()

  setSession({ email: "alice@assembledmedia.com.au" })
  assert.equal((await PUT(putReq(42))).status, 200)
  setSession({ email: "bob@assembledmedia.com.au" })
  assert.equal((await PUT(putReq(42))).status, 200)
  assert.equal(table.size, 2)

  setSession({ email: "alice@assembledmedia.com.au" })
  assert.equal((await DELETE(deleteReq(42))).status, 200)
  assert.equal(table.size, 1)
  assert.equal([...table.values()][0]?.userId, "bob@assembledmedia.com.au")

  const aliceGet = (await (await GET(getReq(42))).json()) as {
    draft?: unknown
    others?: Array<{ userId: string }>
  }
  assert.equal(aliceGet.draft, null)
  assert.deepEqual(
    (aliceGet.others ?? []).map((o) => o.userId),
    ["bob@assembledmedia.com.au"]
  )
})
