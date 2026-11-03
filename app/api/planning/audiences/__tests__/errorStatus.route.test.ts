/**
 * /api/planning/audiences error statuses (B8, I-1; B23 C-167). The dead 401
 * and XANO_API_KEY branches went. A status-500 XanoPlanningAudienceError
 * ("DATABASE_URL is not set") is a server misconfiguration and answers 500 on
 * the list, [id] and by-mba routes (decision P16). Any other audience error is
 * 502 (404 stays 404 on [id]), and anything else is 500.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

class XanoPlanningAudienceError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let nextError: unknown = null
const fail = async () => {
  throw nextError
}

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireRole: async () => ({ session: { user: { sub: "auth0|luke" } }, roles: ["admin"] }) },
  })
  await mock.module("@/lib/auth0", {
    namedExports: { auth0: { getSession: async () => ({ user: { sub: "auth0|luke" } }) } },
  })
  await mock.module("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: async () => ({ ok: true, isClient: false }) },
  })
  await mock.module("@/lib/planning/clientSafeAudience", {
    namedExports: { toClientSafePlannedAudience: async (row: unknown) => row },
  })
  await mock.module("@/lib/planning/xanoPlanningAudiences", {
    namedExports: {
      XanoPlanningAudienceError,
      listPlanningAudiences: fail,
      listPlanningAudiencesByMba: fail,
      createPlanningAudience: fail,
      getPlanningAudience: fail,
      updatePlanningAudience: fail,
    },
  })
}

const list = await import("../route")
const byId = await import("../[id]/route")
const byMba = await import("../by-mba/route")

const listGet = () => list.GET(new NextRequest("http://localhost/api/planning/audiences"))
const mbaGet = () => byMba.GET(new NextRequest("http://localhost/api/planning/audiences/by-mba?mba_number=KRUSTY001"))
const idGet = () =>
  byId.GET(new NextRequest("http://localhost/api/planning/audiences/7"), { params: Promise.resolve({ id: "7" }) })

test("list: a missing DATABASE_URL is a 500 with its message (C-167)", { skip }, async () => {
  nextError = new XanoPlanningAudienceError("DATABASE_URL is not set", 500)
  const res = await listGet()
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "DATABASE_URL is not set" })
})

test("list: any other audience error is 502; a status 401 or an XANO_API_KEY message no longer special-cases", { skip }, async () => {
  for (const err of [
    new XanoPlanningAudienceError("list failed", 502),
    new XanoPlanningAudienceError("Xano unauthorized", 401),
    new XanoPlanningAudienceError("XANO_API_KEY is not set", 502),
  ]) {
    nextError = err
    assert.equal((await listGet()).status, 502, err.message)
  }
})

test("list: the status decides, not the message: any status-500 audience error is 500", { skip }, async () => {
  nextError = new XanoPlanningAudienceError("XANO_API_KEY is not set", 500)
  assert.equal((await listGet()).status, 500)
})

test("by-mba: a missing DATABASE_URL is a 500, any other audience error is 502, anything else 500", { skip }, async () => {
  nextError = new XanoPlanningAudienceError("DATABASE_URL is not set", 500)
  const res = await mbaGet()
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "DATABASE_URL is not set" })
  nextError = new XanoPlanningAudienceError("list by mba failed", 502)
  assert.equal((await mbaGet()).status, 502)
  nextError = new Error("boom")
  assert.equal((await mbaGet()).status, 500)
})

test("list: an unexpected error is 500", { skip }, async () => {
  nextError = new Error("boom")
  const res = await listGet()
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "Internal server error" })
})

test("[id]: 404 stays 404, a missing DATABASE_URL is 500, a 401 is no longer special", { skip }, async () => {
  nextError = new XanoPlanningAudienceError("Audience not found", 404)
  assert.equal((await idGet()).status, 404)
  nextError = new XanoPlanningAudienceError("DATABASE_URL is not set", 500)
  assert.equal((await idGet()).status, 500)
  nextError = new XanoPlanningAudienceError("x", 401)
  assert.equal((await idGet()).status, 502)
})
