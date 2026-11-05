/**
 * SEC-19: GET /api/clients/[id] is admin only, the same gate as PUT and PATCH.
 * The row is the full client record (brain, fees, ad serving rates,
 * is_test_client). A client user gets 403 for its own id and any other id,
 * and a signed-in user with no role (or an unknown one) gets 403. Admin reads
 * any id and gets the full row. PUT and PATCH are unchanged.
 *
 * The real requireRole and rbac run; only the Auth0 session, the reader, the
 * slug lookup and the writer are mocked.
 *
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const ROLES = "https://assembledview.com/roles"
const SLUG = "https://assembledview.com/client_slug"

const ADMIN = { email: "luke@assembledmedia.com.au", [ROLES]: ["admin"] }
const CLIENT_OWN = { email: "meg@acme.example", [ROLES]: ["client"], [SLUG]: "acme" }
const ROLE_LESS = { email: "nobody@example.com" }
const UNKNOWN_ROLE = { email: "old@example.com", [ROLES]: ["manager"] }

let sessionUser: Record<string, unknown> | null = null
const getSessionMock = mock.fn(async (_req?: unknown) => (sessionUser ? { user: sessionUser } : null))

/** Acme is id 77; the client user's own row. */
const FULL_ROW = {
  id: 77,
  mp_client_name: "Acme",
  slug: "acme",
  client_brain: "internal notes",
  feesearch: 15,
  adservimp: 0.15,
  is_test_client: false,
}
const readClientByIdMock = mock.fn(async (id: string | number) => ({
  status: 200,
  body: { ...FULL_ROW, id: Number(id) },
}))
const fetchRowBySlugMock = mock.fn(async (slug: string) => (slug === "acme" ? { id: 77, slug: "acme" } : null))
const updateClientMock = mock.fn(async (id: string, body: Record<string, unknown>, mode: string) => ({
  row: { id: Number(id), mode, ...body },
}))

if (typeof mock.module === "function") {
  await mock.module("@/lib/auth0", {
    namedExports: { auth0: { getSession: getSessionMock } },
  })
  await mock.module("@/lib/data/readClients", {
    namedExports: { readClientById: readClientByIdMock },
  })
  await mock.module("@/lib/clients/fetchClientRowByUrlSlug", {
    namedExports: { fetchXanoClientRowByUrlSlug: fetchRowBySlugMock },
  })
  await mock.module("@/lib/data/writeClients", {
    namedExports: { updateClientPostgresFirst: updateClientMock },
  })
}

const route = skip ? null : await import("../[id]/route")

function reset(user: Record<string, unknown> | null) {
  sessionUser = user
  readClientByIdMock.mock.resetCalls()
  fetchRowBySlugMock.mock.resetCalls()
  updateClientMock.mock.resetCalls()
}

async function get(id: string) {
  return route!.GET(new NextRequest(`http://localhost/api/clients/${id}`), {
    params: Promise.resolve({ id }),
  })
}

async function write(method: "PUT" | "PATCH", id: string, body: Record<string, unknown>) {
  const handler = method === "PUT" ? route!.PUT : route!.PATCH
  return handler(
    new NextRequest(`http://localhost/api/clients/${id}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

test("GET: no session is 401 unauthorised and reads nothing", { skip }, async () => {
  reset(null)
  const res = await get("77")
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorised" })
  assert.equal(readClientByIdMock.mock.calls.length, 0)
})

test("GET: a client user reading its own id is 403 forbidden and reads nothing", { skip }, async () => {
  reset(CLIENT_OWN)
  const res = await get("77")
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
  assert.equal(readClientByIdMock.mock.calls.length, 0)
})

test("GET: a client user reading another id is 403 forbidden and reads nothing", { skip }, async () => {
  reset(CLIENT_OWN)
  const res = await get("58")
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
  assert.equal(readClientByIdMock.mock.calls.length, 0)
})

test("GET: a signed-in user with no role is 403 forbidden and reads nothing", { skip }, async () => {
  reset(ROLE_LESS)
  const res = await get("77")
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
  assert.equal(readClientByIdMock.mock.calls.length, 0)
})

test("GET: an unknown role (normalised to none) is 403 forbidden", { skip }, async () => {
  reset(UNKNOWN_ROLE)
  const res = await get("77")
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
  assert.equal(readClientByIdMock.mock.calls.length, 0)
})

test("GET: admin reads any id and gets the full row", { skip }, async () => {
  for (const id of ["77", "58"]) {
    reset(ADMIN)
    const res = await get(id)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ...FULL_ROW, id: Number(id) })
    assert.equal(readClientByIdMock.mock.calls.length, 1)
    assert.equal(readClientByIdMock.mock.calls[0]!.arguments[0], id)
  }
  // Admin never goes through the client slug lookup.
  assert.equal(fetchRowBySlugMock.mock.calls.length, 0)
})

test("GET: admin, reader 404 passes through", { skip }, async () => {
  reset(ADMIN)
  readClientByIdMock.mock.mockImplementationOnce(async () => ({
    status: 404,
    body: { error: "Client not found" } as never,
  }))
  const res = await get("999")
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: "Client not found" })
})

for (const method of ["PUT", "PATCH"] as const) {
  test(`${method}: unchanged. No session 401, client 403, role-less 403, admin writes`, { skip }, async () => {
    reset(null)
    let res = await write(method, "77", { mp_client_name: "Acme" })
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), { error: "Unauthorized" })

    reset(CLIENT_OWN)
    res = await write(method, "77", { mp_client_name: "Acme" })
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { error: "Forbidden" })
    // The writer never runs for a client, so a write-then-gate order can't pass.
    assert.equal(updateClientMock.mock.calls.length, 0)

    reset(ROLE_LESS)
    res = await write(method, "77", { mp_client_name: "Acme" })
    assert.equal(res.status, 403)
    assert.equal(updateClientMock.mock.calls.length, 0)

    reset(ADMIN)
    res = await write(method, "77", { mp_client_name: "Acme" })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      id: 77,
      mode: method === "PUT" ? "update" : "patch",
      mp_client_name: "Acme",
    })
    assert.equal(updateClientMock.mock.calls.length, 1)
    assert.deepEqual(updateClientMock.mock.calls[0]!.arguments, [
      "77",
      { mp_client_name: "Acme" },
      method === "PUT" ? "update" : "patch",
    ])
  })
}
