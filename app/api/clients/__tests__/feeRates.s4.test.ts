/**
 * S4: client fee rate changes on the server.
 *
 * - /api/clients/[id]/fee-rates: admin only (401 and 403 read nothing), 404
 *   with client_fee_rate_history off, 400 for a bad id or body, 404 for a
 *   missing client, 409 for a second change on the same fee and date, DELETE
 *   only within the client, and a write that
 *   saved but whose list re-read failed says it saved instead of a 500.
 * - GET /api/clients: with the switch on each row carries its changes; off,
 *   the rows are as before and nothing is read; a failed read fails the list
 *   (clients-unavailable), so the editors block save.
 * - parseClientFeeRateChangeInput: the trust boundary.
 *
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

let role: "admin" | "client" | null = "admin"
let switchOn = true
const requireRoleMock = mock.fn(async () =>
  role === null
    ? { response: new Response(null, { status: 401 }) }
    : role === "client"
      ? { response: new Response(null, { status: 403 }) }
      : { session: { user: { email: "luke@assembledmedia.com.au" } }, roles: ["admin"], clientSlug: null },
)
const isFeatureOnMock = mock.fn(async (key: string) => {
  assert.equal(key, "client_fee_rate_history")
  return switchOn
})
const fetchClientByIdMock = mock.fn(async (id: string | number) => (Number(id) === 58 ? { id: 58 } : null))
const STORED = { id: 3, clientId: 58, field: "feesearch", ratePct: 12, effectiveFrom: "2026-12-01" }
let listThrows = false
const listMock = mock.fn(async (ids?: readonly number[]) => {
  if (listThrows) throw new Error("db down")
  const all = new Map([[58, [STORED]]])
  return ids ? new Map([...all].filter(([k]) => ids.includes(k))) : all
})
let insertError: unknown = null
const insertMock = mock.fn(async (_clientId: number, _change: unknown, _by: string | null) => {
  if (insertError) throw insertError
  return STORED
})
const deleteMock = mock.fn(async (clientId: number, id: number) => clientId === 58 && id === 3)
const cachedListMock = mock.fn(async () => ({ data: [{ id: 58, mp_client_name: "Humanforce" }, { id: 7 }], stale: false }))

const real = skip ? null : await import("@/lib/data/clientFeeRates")

if (!skip) {
  await mock.module!("@/lib/requireRole", { namedExports: { requireRole: requireRoleMock } })
  await mock.module!("@/lib/features/server", { namedExports: { isFeatureOn: isFeatureOnMock } })
  await mock.module!("@/lib/clients/fetchClientById", { namedExports: { fetchClientById: fetchClientByIdMock } })
  await mock.module!("@/lib/data/writeClients", {
    namedExports: { createClientPostgresFirst: async () => ({}) },
  })
  await mock.module!("@/lib/cache/clientsCache", { namedExports: { getCachedClientsList: cachedListMock } })
  await mock.module!("@/lib/data/clientFeeRates", {
    namedExports: {
      listClientFeeRateChanges: listMock,
      insertClientFeeRateChange: insertMock,
      deleteClientFeeRateChange: deleteMock,
      parseClientFeeRateChangeInput: real!.parseClientFeeRateChangeInput,
    },
  })
}

const route = skip ? null : await import("../[id]/fee-rates/route")
const listRoute = skip ? null : await import("../route")

const URL_58 = "http://localhost/api/clients/58/fee-rates"
const ctx = (id = "58") => ({ params: Promise.resolve({ id }) })
const post = (body: unknown, id = "58") =>
  route!.POST(
    new NextRequest(URL_58, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    ctx(id),
  )
const GOOD = { field: "feesearch", ratePct: 12, effectiveFrom: "2026-12-01" }

function reset() {
  role = "admin"
  switchOn = true
  listThrows = false
  insertError = null
  for (const m of [listMock, insertMock, deleteMock, fetchClientByIdMock]) m.mock.resetCalls()
}

test("anon is 401 and a client user is 403; neither reads nor writes", { skip }, async () => {
  for (const r of [null, "client"] as const) {
    reset()
    role = r
    const status = r === null ? 401 : 403
    assert.equal((await route!.GET(new NextRequest(URL_58), ctx())).status, status)
    assert.equal((await post(GOOD)).status, status)
    assert.equal((await route!.DELETE(new NextRequest(`${URL_58}?changeId=3`, { method: "DELETE" }), ctx())).status, status)
    assert.equal(listMock.mock.callCount() + insertMock.mock.callCount() + deleteMock.mock.callCount(), 0)
  }
})

test("switch off: every method is 404 and touches nothing", { skip }, async () => {
  reset()
  switchOn = false
  assert.equal((await route!.GET(new NextRequest(URL_58), ctx())).status, 404)
  assert.equal((await post(GOOD)).status, 404)
  assert.equal(listMock.mock.callCount() + insertMock.mock.callCount() + fetchClientByIdMock.mock.callCount(), 0)
})

test("bad client id is 400; a missing client is 404", { skip }, async () => {
  reset()
  assert.equal((await route!.GET(new NextRequest(URL_58), ctx("abc"))).status, 400)
  assert.equal((await route!.GET(new NextRequest(URL_58), ctx("0"))).status, 400)
  assert.equal((await post(GOOD, "59")).status, 404)
  assert.equal(insertMock.mock.callCount(), 0)
})

test("GET lists this client's changes", { skip }, async () => {
  reset()
  const res = await route!.GET(new NextRequest(URL_58), ctx())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { changes: [STORED] })
  assert.deepEqual(listMock.mock.calls[0].arguments[0], [58])
})

test("POST saves a valid change with the admin's email and returns the list", { skip }, async () => {
  reset()
  const res = await post(GOOD)
  assert.equal(res.status, 201)
  assert.deepEqual(insertMock.mock.calls[0].arguments, [58, GOOD, "luke@assembledmedia.com.au"])
  assert.deepEqual(await res.json(), { changes: [STORED] })
})

test("POST refuses a bad body with 400 and writes nothing", { skip }, async () => {
  reset()
  for (const body of [
    null,
    { ...GOOD, field: "feeproduction" },
    { ...GOOD, ratePct: -1 },
    { ...GOOD, ratePct: 100.01 },
    { ...GOOD, ratePct: "12" },
    { ...GOOD, effectiveFrom: "2026-02-30" },
    { ...GOOD, effectiveFrom: "01/12/2026" },
  ]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body))
  }
  assert.equal(insertMock.mock.callCount(), 0)
})

test("POST: a second change on the same fee and date is 409", { skip }, async () => {
  reset()
  insertError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" })
  const res = await post(GOOD)
  assert.equal(res.status, 409)
  assert.match(String((await res.json()).error), /already has a change on that date/)
})

test("DELETE removes only a change of this client; another id is 404; a bad id is 400", { skip }, async () => {
  reset()
  const del = (q: string) => route!.DELETE(new NextRequest(`${URL_58}${q}`, { method: "DELETE" }), ctx())
  assert.equal((await del("?changeId=3")).status, 200)
  assert.deepEqual(deleteMock.mock.calls[0].arguments, [58, 3])
  assert.equal((await del("?changeId=4")).status, 404)
  assert.equal((await del("?changeId=x")).status, 400)
  assert.equal((await del("")).status, 400)
})

test("a saved write whose list re-read fails says it saved (201 / 200), never a 500", { skip }, async () => {
  reset()
  listThrows = true
  const res = await post(GOOD)
  assert.equal(res.status, 201)
  assert.equal(insertMock.mock.callCount(), 1)
  const body = await res.json()
  assert.equal(body.changes, null)
  assert.match(String(body.message), /^Saved\./)
  const del = await route!.DELETE(new NextRequest(`${URL_58}?changeId=3`, { method: "DELETE" }), ctx())
  assert.equal(del.status, 200)
  assert.equal((await del.json()).changes, null)
})

test("GET /api/clients: switch on, each row carries its changes (none is [])", { skip }, async () => {
  reset()
  const res = await listRoute!.GET(new NextRequest("http://localhost/api/clients"))
  assert.equal(res.status, 200)
  const rows = (await res.json()) as Record<string, unknown>[]
  assert.deepEqual(rows[0].fee_rate_changes, [STORED])
  assert.deepEqual(rows[1].fee_rate_changes, [])
})

test("GET /api/clients: switch off, rows as before and nothing read", { skip }, async () => {
  reset()
  switchOn = false
  const rows = (await (await listRoute!.GET(new NextRequest("http://localhost/api/clients"))).json()) as Record<string, unknown>[]
  assert.ok(rows.every((r) => !("fee_rate_changes" in r)))
  assert.equal(listMock.mock.callCount(), 0)
})

test("GET /api/clients: a failed read fails the list, so the editors block save", { skip }, async () => {
  reset()
  listThrows = true
  const res = await listRoute!.GET(new NextRequest("http://localhost/api/clients"))
  assert.equal(res.headers.get("x-warning"), "clients-unavailable")
  assert.deepEqual(await res.json(), [])
})
