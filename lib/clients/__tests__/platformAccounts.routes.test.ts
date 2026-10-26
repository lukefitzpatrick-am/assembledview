/**
 * Auth and write behaviour for client platform accounts.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const fetchClientByIdMock = mock.fn(async (_id: string | number) => ({ id: 77 }) as Record<string, unknown> | null)
const listMock = mock.fn(async (_clientId: number) => [] as Array<Record<string, unknown>>)
type AccountPayload = {
  id: number
  clientId: number
  platform: string
  accountRef: string
  label: string | null
  active: boolean
  createdAt: string
  updatedAt: string | null
}

const insertMock = mock.fn(async (_input: Record<string, unknown>): Promise<AccountPayload> => ({
  id: 1,
  clientId: 77,
  platform: "meta_ads",
  accountRef: "1033480917",
  label: null,
  active: true,
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: null,
}))
const patchMock = mock.fn(async (_input: Record<string, unknown>): Promise<AccountPayload> => ({
  id: 4,
  clientId: 77,
  platform: "cm360",
  accountRef: "BOSS Engineering",
  label: null,
  active: false,
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: "2026-10-14T01:00:00.000Z",
}))
const listAdvertisersMock = mock.fn(async (_platform: string) => [
  { name: "BOSS Engineering", firstSeen: "2026-09-01", lastSeen: "2026-10-01", rowCount: 12 },
])

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/clients/fetchClientById", {
    namedExports: { fetchClientById: fetchClientByIdMock },
  })
  await mock.module!("@/lib/clients/platformAccountsRepo", {
    namedExports: {
      listActivePlatformAccounts: listMock,
      insertPlatformAccount: insertMock,
      patchPlatformAccount: patchMock,
      PlatformAccountsNotReadyError: class PlatformAccountsNotReadyError extends Error {},
      PlatformAccountConflictError: class PlatformAccountConflictError extends Error {},
      PlatformAccountPlatformNotReadyError: class PlatformAccountPlatformNotReadyError extends Error {},
    },
  })
  await mock.module!("@/lib/clients/platformAdvertisers", {
    namedExports: { listPlatformAdvertisers: listAdvertisersMock },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

function sessionFor(role: "admin" | "client") {
  return {
    user: {
      email: `${role}@example.com`,
      [ROLE_CLAIM]: [role],
      app_metadata: { role },
    },
  }
}

function params(id = "77") {
  return { params: Promise.resolve({ id }) }
}

async function loadAccountsRoute() {
  return import("../../../app/api/clients/[id]/platform-accounts/route.js")
}

async function loadAdvertisersRoute() {
  return import("../../../app/api/platform-accounts/advertisers/route.js")
}

function resetMocks() {
  getSessionMock.mock.resetCalls()
  fetchClientByIdMock.mock.resetCalls()
  listMock.mock.resetCalls()
  insertMock.mock.resetCalls()
  patchMock.mock.resetCalls()
  listAdvertisersMock.mock.resetCalls()
  fetchClientByIdMock.mock.mockImplementation(async () => ({ id: 77 }))
  listMock.mock.mockImplementation(async () => [])
  insertMock.mock.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 1,
    clientId: 77,
    platform: String(input.platform),
    accountRef: String(input.accountRef),
    label: typeof input.label === "string" ? input.label : null,
    active: true,
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: null,
  }))
  patchMock.mock.mockImplementation(async (input: Record<string, unknown>) => ({
    id: Number(input.id),
    clientId: 77,
    platform: "cm360",
    accountRef: "BOSS Engineering",
    label: typeof input.label === "string" ? input.label : null,
    active: input.active !== false,
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T01:00:00.000Z",
  }))
  listAdvertisersMock.mock.mockImplementation(async () => [
    { name: "BOSS Engineering", firstSeen: "2026-09-01", lastSeen: "2026-10-01", rowCount: 12 },
  ])
}

test("platform account routes — anon is 401 and does not read", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => null)
  const accounts = await loadAccountsRoute()
  const advertisers = await loadAdvertisersRoute()
  const getRes = await accounts.GET(new NextRequest("http://localhost/api/clients/77/platform-accounts"), params())
  const postRes = await accounts.POST(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", {
      method: "POST",
      body: JSON.stringify({ platform: "meta_ads", accountRef: "1" }),
    }),
    params(),
  )
  const patchRes = await accounts.PATCH(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", {
      method: "PATCH",
      body: JSON.stringify({ id: 4, active: false }),
    }),
    params(),
  )
  const adsRes = await advertisers.GET(new NextRequest("http://localhost/api/platform-accounts/advertisers?platform=cm360"))
  assert.equal(getRes.status, 401)
  assert.equal(postRes.status, 401)
  assert.equal(patchRes.status, 401)
  assert.equal(adsRes.status, 401)
  assert.equal(listMock.mock.calls.length, 0)
  assert.equal(insertMock.mock.calls.length, 0)
  assert.equal(patchMock.mock.calls.length, 0)
  assert.equal(listAdvertisersMock.mock.calls.length, 0)
})

test("platform account routes — client role is 403", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => sessionFor("client"))
  const accounts = await loadAccountsRoute()
  const advertisers = await loadAdvertisersRoute()
  const getRes = await accounts.GET(new NextRequest("http://localhost/api/clients/77/platform-accounts"), params())
  const postRes = await accounts.POST(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", { method: "POST", body: "{}" }),
    params(),
  )
  const patchRes = await accounts.PATCH(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", { method: "PATCH", body: "{}" }),
    params(),
  )
  const adsRes = await advertisers.GET(new NextRequest("http://localhost/api/platform-accounts/advertisers?platform=dv360"))
  assert.equal(getRes.status, 403)
  assert.equal(postRes.status, 403)
  assert.equal(patchRes.status, 403)
  assert.equal(adsRes.status, 403)
  assert.equal(fetchClientByIdMock.mock.calls.length, 0)
  assert.equal(listAdvertisersMock.mock.calls.length, 0)
})

test("platform account routes — admin GET and advertisers GET are 200", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => sessionFor("admin"))
  const accounts = await loadAccountsRoute()
  const advertisers = await loadAdvertisersRoute()
  const getRes = await accounts.GET(new NextRequest("http://localhost/api/clients/77/platform-accounts"), params())
  const adsRes = await advertisers.GET(new NextRequest("http://localhost/api/platform-accounts/advertisers?platform=cm360"))
  assert.equal(getRes.status, 200)
  assert.deepEqual(await getRes.json(), { accounts: [] })
  assert.equal(adsRes.status, 200)
  const body = await adsRes.json()
  assert.equal(body.advertisers[0].name, "BOSS Engineering")
  assert.equal(listMock.mock.calls[0]?.arguments[0], 77)
})

test("POST normalises a Meta act_ ref before insert", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => sessionFor("admin"))
  const { POST } = await loadAccountsRoute()
  const res = await POST(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", {
      method: "POST",
      body: JSON.stringify({ platform: "meta_ads", accountRef: "act_1033480917", label: " Page " }),
    }),
    params(),
  )
  assert.equal(res.status, 201)
  const input = insertMock.mock.calls[0]?.arguments[0] as { accountRef: string; label: string; createdBy: string }
  assert.equal(input.accountRef, "1033480917")
  assert.equal(input.label, "Page")
  assert.equal(input.createdBy, "admin@example.com")
})

test("POST duplicate active ref is 409 with the client name", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => sessionFor("admin"))
  insertMock.mock.mockImplementation(async () => {
    const err = new Error("duplicate")
    Object.assign(err, { code: "PLATFORM_ACCOUNT_CONFLICT", clientName: "Boss Engineering" })
    throw err
  })
  const { POST } = await loadAccountsRoute()
  const res = await POST(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", {
      method: "POST",
      body: JSON.stringify({ platform: "cm360", accountRef: "BOSS Engineering" }),
    }),
    params(),
  )
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: "Already linked to Boss Engineering" })
})

test("POST meta_page before its SQL is applied is 503 with a clear message", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => sessionFor("admin"))
  insertMock.mock.mockImplementation(async () => {
    const err = new Error("check")
    Object.assign(err, { code: "PLATFORM_ACCOUNT_PLATFORM_NOT_READY" })
    throw err
  })
  const { POST } = await loadAccountsRoute()
  const res = await POST(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", {
      method: "POST",
      body: JSON.stringify({ platform: "meta_page", accountRef: "1122334455" }),
    }),
    params(),
  )
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: "This platform needs a database update first" })
  assert.equal((insertMock.mock.calls[0]?.arguments[0] as { accountRef?: string })?.accountRef, "1122334455")
})

test("PATCH deactivate forwards active false", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => sessionFor("admin"))
  const { PATCH } = await loadAccountsRoute()
  const res = await PATCH(
    new NextRequest("http://localhost/api/clients/77/platform-accounts", {
      method: "PATCH",
      body: JSON.stringify({ id: 4, active: false }),
    }),
    params(),
  )
  assert.equal(res.status, 200)
  const input = patchMock.mock.calls[0]?.arguments[0] as { id: number; active: boolean }
  assert.equal(input.id, 4)
  assert.equal(input.active, false)
  assert.equal((await res.json()).account.active, false)
})

test("advertisers route returns 503 when the view is missing", { skip }, async () => {
  resetMocks()
  getSessionMock.mock.mockImplementation(async () => sessionFor("admin"))
  listAdvertisersMock.mock.mockImplementation(async () => {
    throw new Error(
      "SQL compilation error: Object 'ASSEMBLEDVIEW.MART.V_PLATFORM_ADVERTISERS' does not exist or not authorized.",
    )
  })
  const { GET } = await loadAdvertisersRoute()
  const res = await GET(new NextRequest("http://localhost/api/platform-accounts/advertisers?platform=dv360"))
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: "Advertiser list not set up yet" })
})
