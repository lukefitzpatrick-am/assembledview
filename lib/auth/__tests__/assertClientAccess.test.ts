import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import {
  assertClientAccess,
  decideClientAccess,
} from "../assertClientAccess"
import type { ClientGroup } from "../../clients/clientGroup"
import { clientIdsFromGroup, resolveClientGroup } from "../../clients/clientGroup"
import { omitClientBrain } from "../../clients/omitClientBrain"
import { GOLF_CLIENT_ROWS } from "../../clients/__tests__/golfClientRows.fixture"

function groupForIds(...ids: number[]): ClientGroup {
  const members = ids.map((id) => ({ id }))
  return {
    anchor: members[0] ?? { id: 0 },
    members,
    mbaidentifier: "acme",
    nameSlugs: new Set(["acme"]),
  }
}

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
      callerClientIds: new Set(),
    })
    assert.deepEqual(result, { ok: true, isClient: false })
  })

  it("missing session is unauthorised", () => {
    const result = decideClientAccess({
      hasSession: false,
      isAdmin: false,
      isClient: true,
      requestedClientId: 1,
      callerClientIds: new Set([1]),
    })
    assert.deepEqual(result, { ok: false, status: 401 })
  })

  it("client-role caller for their own client passes", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 7,
      callerClientIds: new Set([7]),
    })
    assert.deepEqual(result, { ok: true, isClient: true })
  })

  it("client-role caller for another client's id is refused", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 7,
      callerClientIds: new Set([9]),
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })

  it("client-role caller with no resolved caller client is refused", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 7,
      callerClientIds: new Set(),
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })

  it("requested clientId 0 (unresolved) is refused for a client-role caller", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: true,
      requestedClientId: 0,
      callerClientIds: new Set([0]),
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })

  it("non-admin non-client staff is refused", () => {
    const result = decideClientAccess({
      hasSession: true,
      isAdmin: false,
      isClient: false,
      requestedClientId: 7,
      callerClientIds: new Set([7]),
    })
    assert.deepEqual(result, { ok: false, status: 403 })
  })
})

async function fetchGolfGroup(slug: string): Promise<ClientGroup | null> {
  const group = resolveClientGroup(GOLF_CLIENT_ROWS, slug)
  if (!group) return null
  return {
    ...group,
    anchor: omitClientBrain(group.anchor),
    members: group.members.map((m) => omitClientBrain(m)),
  }
}

describe("assertClientAccess", () => {
  it("admin session passes without a client-row lookup", async () => {
    let fetched = 0
    const result = await assertClientAccess(req(), 7, {
      getSession: async () => ({ user: { email: "admin@example.com" } }),
      getUserRoles: () => ["admin"],
      getUserClientIdentifier: () => null,
      fetchClientGroupBySlug: async () => {
        fetched += 1
        return groupForIds(7)
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
      fetchClientGroupBySlug: async (slug) => {
        assert.equal(slug, "acme")
        return groupForIds(7)
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
      fetchClientGroupBySlug: async () => groupForIds(9),
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
      fetchClientGroupBySlug: async () => null,
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
      fetchClientGroupBySlug: async () => null,
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.response instanceof NextResponse)
  })

  it("caller golf-australia, requested clients.id 46 allows (sibling)", async () => {
    const group = await fetchGolfGroup("golf-australia")
    assert.ok(group)
    assert.deepEqual([...clientIdsFromGroup(group)].sort((a, b) => a - b), [19, 46])
    const result = await assertClientAccess(req(), 46, {
      getSession: async () => ({ user: { email: "golf@example.com" } }),
      getUserRoles: () => ["client"],
      getUserClientIdentifier: () => "golf-australia",
      fetchClientGroupBySlug: fetchGolfGroup,
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.isClient, true)
  })

  it("caller golf-australia, requested clients.id 41 denies (other group)", async () => {
    const result = await assertClientAccess(req(), 41, {
      getSession: async () => ({ user: { email: "golf@example.com" } }),
      getUserRoles: () => ["client"],
      getUserClientIdentifier: () => "golf-australia",
      fetchClientGroupBySlug: fetchGolfGroup,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.response.status, 403)
    }
  })
})
