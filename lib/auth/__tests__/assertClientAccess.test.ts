import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import {
  assertClientAccess,
  decideClientAccess,
} from "../assertClientAccess"

function req(): NextRequest {
  return new NextRequest("http://localhost/api/finance/invoices/inv-1/pdf")
}

describe("decideClientAccess", () => {
  it("admin passes regardless of requested client", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: true,
      isClient: false,
      requestedClientId: 42,
      callerClientId: null,
    })
    assert.deepEqual(result, { ok: true, isClient: false })
  })

  it("missing session is unauthorised", () => {
    const result = decideClientAccess({
      hasSession: false,
      isAdmin: false,
      isClient: true,
      requestedClientId: 1,
      callerClientId: 1,
    })
    assert.deepEqual(result, { ok: false, status: 401 })
  })

  it("client-role caller for their own client passes", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 7,
      callerClientId: 7,
    })
    assert.deepEqual(result, { ok: true, isClient: true })
  })

  it("client-role caller for another client's id is refused", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 7,
      callerClientId: 9,
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })

  it("client-role caller with no resolved caller client is refused", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 7,
      callerClientId: null,
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })

  it("requested clientId 0 (unresolved) is refused for a client-role caller", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 0,
      callerClientId: 0,
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })

  it("non-admin non-client staff is refused", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: false,
      requestedClientId: 7,
      callerClientId: 7,
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })
})

describe("assertClientAccess", () => {
  it("admin session passes without a client-row lookup", async () => {
    let fetched = 0
    const result = await assertClientAccess(req(), 7, {
      getSession: async () => ({ user: { email: "admin@example.com" } }),
      getUserRoles: () => ["admin"],
      getUserClientIdentifier: () => null,
      fetchClientBySlug: async () => {
        fetched += 1
        return { id: 7 }
      },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.isClient, false)
    assert.equal(fetched, 0)
  })

  it("client-role session matching the requested id passes", async () => {
    const result = await assertClientAccess(req(), 7, {
      getSession: async () => ({ user: { email: "client@example.com" } }),
      getUserRoles: () => ["client"],
      getUserClientIdentifier: () => "acme",
      fetchClientBySlug: async (slug) => {
        assert.equal(slug, "acme")
        return { id: 7 }
      },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.isClient, true)
  })

  it("client-role session for another client's id returns 403", async () => {
    const result = await assertClientAccess(req(), 7, {
      getSession: async () => ({ user: { email: "client@example.com" } }),
      getUserRoles: () => ["client"],
      getUserClientIdentifier: () => "other",
      fetchClientBySlug: async () => ({ id: 9 }),
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.response.status, 403)
      assert.deepEqual(await result.response.json(), { error: "forbidden" })
    }
  })

  it("no session returns 401", async () => {
    const result = await assertClientAccess(req(), 7, {
      getSession: async () => null,
      getUserRoles: () => [],
      getUserClientIdentifier: () => null,
      fetchClientBySlug: async () => null,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.response.status, 401)
      assert.deepEqual(await result.response.json(), { error: "unauthorised" })
    }
  })

  it("returns NextResponse instances (not thrown errors)", async () => {
    const result = await assertClientAccess(req(), 7, {
      getSession: async () => null,
      getUserRoles: () => [],
      getUserClientIdentifier: () => null,
      fetchClientBySlug: async () => null,
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.response instanceof NextResponse)
  })
})
