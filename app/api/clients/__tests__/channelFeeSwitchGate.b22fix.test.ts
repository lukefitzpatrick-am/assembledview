/**
 * B22fix R2: the client write path drops the 12 channel fees from 0113 when
 * the switch channel_client_fees is off, on every route (PUT and PATCH
 * /api/clients/[id], POST /api/clients). Off, a body with the 12 writes what
 * the same body without them writes (the pre-B22 write). On, B22's write.
 * Review finding 2.
 *
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { schema as realSchema } from "@/db"
import { mockModuleSkip } from "@/lib/test/mockModuleHarness"
import { CHANNEL_CLIENT_FEE_FIELDS } from "@/lib/finance/clientFeeChannels"

const skip = mockModuleSkip()

type Write = { op: "update" | "insert"; table: unknown; values: Record<string, unknown> }
const writes: Write[] = []
let switchOn = false
let switchThrows = false
const isFeatureOnMock = mock.fn(async (key: string) => {
  assert.equal(key, "channel_client_fees")
  if (switchThrows) throw new Error("switch read failed")
  return switchOn
})

const requireRoleMock = mock.fn(async () => ({
  session: { user: { email: "luke@assembledmedia.com.au" } },
  roles: ["admin"],
  clientSlug: null,
  grantedByAllowlist: false,
}))

const getDbMock = () => ({
  update(table: unknown) {
    return {
      set(values: Record<string, unknown>) {
        return {
          where() {
            return {
              returning: async () => {
                writes.push({ op: "update", table, values })
                return [{ id: 58, mpClientName: "Humanforce", ...values }]
              },
            }
          },
        }
      },
    }
  },
  insert(table: unknown) {
    return {
      values(values: Record<string, unknown>) {
        return {
          returning: async () => {
            writes.push({ op: "insert", table, values })
            return [{ id: 99, ...values }]
          },
        }
      },
    }
  },
  select() {
    return {
      from() {
        return {
          where() {
            return { limit: async () => [{ id: 58 }] }
          },
        }
      },
    }
  },
})

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireRole: requireRoleMock, requireAdmin: requireRoleMock },
  })
  await mock.module("@/db", {
    namedExports: { schema: realSchema, getDb: getDbMock },
  })
  // The [id] route imports auth0 for GET; PUT and PATCH go through requireRole.
  await mock.module("@/lib/auth0", {
    namedExports: { auth0: { getSession: async () => null } },
  })
  await mock.module("@/lib/features/server", {
    namedExports: { isFeatureOn: isFeatureOnMock },
  })
}

const idRoute = skip ? null : await import("../[id]/route")
const listRoute = skip ? null : await import("../route")

const TWELVE_SET = Object.fromEntries(CHANNEL_CLIENT_FEE_FIELDS.map((f, i) => [f, i + 1]))
const TWELVE_NULL = Object.fromEntries(CHANNEL_CLIENT_FEE_FIELDS.map((f) => [f, null]))
const BASE_EDIT = { mp_client_name: "Humanforce", mbaidentifier: "HUMFOR", feesearch: 15, feesocial: 15, website: "" }

function req(method: string, url: string, body: unknown) {
  return new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
}

async function put(body: Record<string, unknown>, method: "PUT" | "PATCH" = "PUT"): Promise<Write | undefined> {
  writes.length = 0
  const handler = method === "PUT" ? idRoute!.PUT : idRoute!.PATCH
  const res = await handler(req(method, "http://localhost/api/clients/58", body), {
    params: Promise.resolve({ id: "58" }),
  })
  assert.equal(res.status, 200)
  return writes[0]
}

async function post(body: Record<string, unknown>): Promise<Write | undefined> {
  writes.length = 0
  const res = await listRoute!.POST(req("POST", "http://localhost/api/clients", body))
  assert.equal(res.status, 201)
  return writes[0]
}

function setSwitch(on: boolean) {
  switchOn = on
  switchThrows = false
  isFeatureOnMock.mock.resetCalls()
}

test("switch off: PUT and PATCH with the 12 write what the body without them writes", { skip }, async () => {
  setSwitch(false)
  for (const method of ["PUT", "PATCH"] as const) {
    const without = await put(BASE_EDIT, method)
    for (const twelve of [TWELVE_SET, TWELVE_NULL]) {
      const withTwelve = await put({ ...BASE_EDIT, ...twelve }, method)
      assert.deepEqual(withTwelve, without, method)
    }
    assert.deepEqual(without?.values, { mpClientName: "Humanforce", mbaidentifier: "HUMFOR", feesearch: 15, feesocial: 15 })
  }
  assert.ok(isFeatureOnMock.mock.callCount() > 0)
})

test("switch off: a body of only the 12 writes nothing (reads the row back)", { skip }, async () => {
  setSwitch(false)
  assert.equal(await put({ feeooh: 10 }), undefined)
  assert.equal(await put({ feeinfluencers: null }, "PATCH"), undefined)
})

test("switch off: POST with the 12 inserts what the body without them inserts", { skip }, async () => {
  setSwitch(false)
  const base = { clientname_input: "New Co", mbaidentifier: "newco", feesearch: 20 }
  const without = await post(base)
  const withTwelve = await post({ ...base, ...TWELVE_SET })
  assert.deepEqual(withTwelve, without)
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) assert.equal(f in (withTwelve?.values ?? {}), false, f)
})

test("switch on: PUT, PATCH and POST write the 12; null clears (B22)", { skip }, async () => {
  setSwitch(true)
  const set = await put({ ...BASE_EDIT, ...TWELVE_SET })
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) assert.equal(set?.values[f], TWELVE_SET[f], f)
  const cleared = await put({ ...BASE_EDIT, feeooh: null, feeinfluencers: null }, "PATCH")
  assert.equal(cleared?.values.feeooh, null)
  assert.equal(cleared?.values.feeinfluencers, null)
  assert.equal("feeradio" in (cleared?.values ?? {}), false)
  const created = await post({ clientname_input: "New Co", mbaidentifier: "newco", feeooh: 10 })
  assert.equal(created?.values.feeooh, 10)
})

test("a body without the 12 never reads the switch", { skip }, async () => {
  setSwitch(true)
  await put(BASE_EDIT)
  await post({ clientname_input: "New Co", mbaidentifier: "newco" })
  assert.equal(isFeatureOnMock.mock.callCount(), 0)
})

test("a failed switch read is off: the 12 are dropped, the rest saves", { skip }, async () => {
  setSwitch(true)
  switchThrows = true
  const w = await put({ ...BASE_EDIT, feeooh: 10 })
  assert.equal(w?.values.feesearch, 15)
  assert.equal("feeooh" in (w?.values ?? {}), false)
  switchThrows = false
})
