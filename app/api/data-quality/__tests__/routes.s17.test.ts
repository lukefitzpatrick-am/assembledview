/**
 * S17 routes: staff only (admin; a client gets 403 before anything is read),
 * 404 with the switch off, a dismissal needs a reason, and the actor is the
 * signed-in user.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type Gate = { session: { user: { email?: string } }; roles: string[] } | { response: NextResponse }
const admin: Gate = { session: { user: { email: "Luke@AM.test" } }, roles: ["admin"] }
const requireRoleMock = mock.fn(async (_req: unknown, _roles: unknown): Promise<Gate> => admin)
let switchOn = true
const listMock = mock.fn(async () => [{ id: 1 }])
const closeMock = mock.fn(async (_id: number, _close: unknown, _actor: string) => true)

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", { namedExports: { requireRole: requireRoleMock } })
  await mock.module("@/lib/features/server", {
    namedExports: { isFeatureOn: async (key: string) => key === "data_quality_queue" && switchOn },
  })
  await mock.module("@/lib/dataQuality/items.server", {
    namedExports: { listOpenDataQualityItems: listMock, closeDataQualityItem: closeMock },
  })
}

const { GET } = await import("../route")
const { PATCH } = await import("../[id]/route")

const get = () => new NextRequest("http://localhost/api/data-quality")
const patch = (id: string, body: unknown) =>
  PATCH(new NextRequest(`http://localhost/api/data-quality/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })
const forbidden = async (): Promise<Gate> => ({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) })

test("a client (or an admin viewing as one) gets 403 and nothing is read or written", { skip }, async () => {
  const reads = listMock.mock.callCount()
  const writes = closeMock.mock.callCount()
  requireRoleMock.mock.mockImplementationOnce(forbidden)
  assert.equal((await GET(get())).status, 403)
  requireRoleMock.mock.mockImplementationOnce(forbidden)
  assert.equal((await patch("1", { action: "resolve" })).status, 403)
  assert.equal(listMock.mock.callCount(), reads)
  assert.equal(closeMock.mock.callCount(), writes)
  for (const call of requireRoleMock.mock.calls) assert.deepEqual(call.arguments[1], ["admin"])
})

test("switch off: 404 and nothing is read or written", { skip }, async () => {
  switchOn = false
  try {
    const reads = listMock.mock.callCount()
    const writes = closeMock.mock.callCount()
    assert.equal((await GET(get())).status, 404)
    assert.equal((await patch("1", { action: "resolve" })).status, 404)
    assert.equal(listMock.mock.callCount(), reads)
    assert.equal(closeMock.mock.callCount(), writes)
  } finally {
    switchOn = true
  }
})

test("an admin reads the open items", { skip }, async () => {
  const res = await GET(get())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { items: [{ id: 1 }] })
})

test("bad ids and bodies are 400; a dismissal needs a reason", { skip }, async () => {
  const writes = closeMock.mock.callCount()
  assert.equal((await patch("abc", { action: "resolve" })).status, 400)
  assert.equal((await patch("0", { action: "resolve" })).status, 400)
  assert.equal((await patch("1", { action: "delete" })).status, 400)
  assert.equal((await patch("1", { action: "dismiss" })).status, 400)
  assert.equal((await patch("1", { action: "dismiss", reason: "   " })).status, 400)
  assert.equal((await patch("1", { action: "dismiss", reason: "x".repeat(1001) })).status, 400)
  assert.equal(closeMock.mock.callCount(), writes)
})

test("resolve and dismiss close the item as the signed-in user; a closed item is 404", { skip }, async () => {
  assert.equal((await patch("7", { action: "dismiss", reason: " Booked direct " })).status, 200)
  const last = closeMock.mock.calls.at(-1)!
  assert.deepEqual(last.arguments, [7, { action: "dismiss", reason: "Booked direct" }, "Luke@AM.test"])
  closeMock.mock.mockImplementationOnce(async () => false)
  assert.equal((await patch("7", { action: "resolve" })).status, 404)
})

test("no email on the session: 401", { skip }, async () => {
  requireRoleMock.mock.mockImplementationOnce(async () => ({ session: { user: {} }, roles: ["admin"] }))
  assert.equal((await patch("7", { action: "resolve" })).status, 401)
})
