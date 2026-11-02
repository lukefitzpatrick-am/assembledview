/**
 * /api/planning/audiences error statuses (B8, I-1). The dead 401 and
 * XANO_API_KEY branches went; statuses stay as they were: every
 * XanoPlanningAudienceError is 502 on the list route (including the 500
 * "DATABASE_URL is not set" one: 500 vs 502 is Luke's call), 404 or 502 on
 * the [id] route, and anything else is 500.
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
  await mock.module("@/lib/planning/xanoPlanningAudiences", {
    namedExports: {
      XanoPlanningAudienceError,
      listPlanningAudiences: fail,
      createPlanningAudience: fail,
      getPlanningAudience: fail,
      updatePlanningAudience: fail,
    },
  })
}

const list = await import("../route")
const byId = await import("../[id]/route")

const listGet = () => list.GET(new NextRequest("http://localhost/api/planning/audiences"))
const idGet = () =>
  byId.GET(new NextRequest("http://localhost/api/planning/audiences/7"), { params: Promise.resolve({ id: "7" }) })

test("list: a missing DATABASE_URL stays a 502 with its message", { skip }, async () => {
  nextError = new XanoPlanningAudienceError("DATABASE_URL is not set", 500)
  const res = await listGet()
  assert.equal(res.status, 502)
  assert.deepEqual(await res.json(), { error: "DATABASE_URL is not set" })
})

test("list: any other audience error is 502; a status 401 or an XANO_API_KEY message no longer special-cases", { skip }, async () => {
  for (const err of [
    new XanoPlanningAudienceError("list failed", 502),
    new XanoPlanningAudienceError("Xano unauthorized", 401),
    new XanoPlanningAudienceError("XANO_API_KEY is not set", 500),
  ]) {
    nextError = err
    assert.equal((await listGet()).status, 502, err.message)
  }
})

test("list: an unexpected error is 500", { skip }, async () => {
  nextError = new Error("boom")
  const res = await listGet()
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "Internal server error" })
})

test("[id]: 404 stays 404, a missing DATABASE_URL stays 502, a 401 is no longer special", { skip }, async () => {
  nextError = new XanoPlanningAudienceError("Audience not found", 404)
  assert.equal((await idGet()).status, 404)
  nextError = new XanoPlanningAudienceError("DATABASE_URL is not set", 500)
  assert.equal((await idGet()).status, 502)
  nextError = new XanoPlanningAudienceError("x", 401)
  assert.equal((await idGet()).status, 502)
})
