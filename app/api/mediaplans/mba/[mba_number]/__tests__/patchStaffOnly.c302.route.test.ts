/**
 * C-302 (B54fix): PATCH /api/mediaplans/mba/[mba_number] is staff only. It
 * rewrites master fields and can publish any version, so a client user scoped
 * to the MBA gets 403 for every field it can change, and nothing is read,
 * patched or stamped. Staff still change each field.
 *
 * The real requireRole, rbac and checkClientMbaAccess run; only the Auth0
 * session, the plan readers, the integrity check, the stamp and the database
 * are mocked.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { NextRequest } from "next/server"

import { schema as realSchema } from "../../../../../../db"
import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness"
import type { FeatureRow } from "../../../../../../lib/features/registry"
import { setFeatureRowReaderForTests } from "../../../../../../lib/features/server"

const skip = mockModuleSkip()
const MBA = "test001"
const ROLES = "https://assembledview.com/roles"

const STAFF = { email: "planner@assembledmedia.com.au", [ROLES]: ["admin"] }
/** A client whose own MBA list holds this plan: checkClientMbaAccess lets it in. */
const CLIENT_IN_SCOPE = { email: "client@acme.example", [ROLES]: ["client"], app_metadata: { mba_numbers: [MBA] } }

let sessionUser: Record<string, unknown> | null = null
const getSessionMock = mock.fn(async () => (sessionUser ? { user: sessionUser } : null))
const readMasterMock = mock.fn(async () => ({ id: 5, mba_number: MBA, campaign_status: "booked" }))
const stampMock = mock.fn(async () => ({ stamped: true, versionId: 77 }))
const updates: unknown[] = []

const fakeDb = {
  execute: async () => [],
  update: () => ({
    set: (v: unknown) => ({
      where: async () => {
        updates.push(v)
      },
    }),
  }),
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: getSessionMock } } })
  const realRead = await import("../../../../../../lib/data/readMediaPlans")
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      ...realRead,
      readPlanMasterByMba: readMasterMock,
      readPlanVersionsByMba: async () => [{ id: 77, version_number: 2 }],
    },
  })
  await mock.module!("@/lib/mediaplan/publishVersionIntegrity", {
    namedExports: {
      isPublishVersionAdvance: (d: { version_number?: unknown } | null) => d != null && d.version_number !== undefined,
      checkPublishLineItemIntegrity: async () => ({ ok: true }),
      countPublishIntegrityChildren: async () => 1,
    },
  })
  await mock.module!("@/lib/data/stampVersionPublication", {
    namedExports: {
      stampVersionPublicationByMbaVersion: stampMock,
      readVersionPublishedAtByMbaVersion: async () => null,
    },
  })
  await mock.module!("@/lib/auth/getCurrentUser", {
    namedExports: { getCurrentUser: async () => ({ email: "planner@assembledmedia.com.au" }) },
  })
  await mock.module!("@/db", { namedExports: { getDb: () => fakeDb, schema: realSchema } })
}

afterEach(() => setFeatureRowReaderForTests(null))

/** Every field the PATCH can change, one body each. */
const FIELDS: Array<[string, Record<string, unknown>]> = [
  ["campaign name", { mp_campaignname: "New name" }],
  ["campaign status", { campaign_status: "approved" }],
  ["campaign start date", { campaign_start_date: "2026-11-02" }],
  ["campaign end date", { campaign_end_date: "2026-11-29" }],
  ["campaign budget", { mp_campaignbudget: 1234 }],
  ["published version", { version_number: 2 }],
]

function request(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/mediaplans/mba/${MBA}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function patch(user: Record<string, unknown>, body: Record<string, unknown>) {
  sessionUser = user
  setFeatureRowReaderForTests(async () => new Map<string, FeatureRow>())
  readMasterMock.mock.resetCalls()
  stampMock.mock.resetCalls()
  updates.length = 0
  const { PATCH } = await import("../route.js")
  return PATCH(request(body), { params: Promise.resolve({ mba_number: MBA }) })
}

test("the client is in scope for this MBA (the GET gate lets it read the plan)", { skip }, async () => {
  sessionUser = CLIENT_IN_SCOPE
  const { checkClientMbaAccess } = await import("../../../../../../lib/auth/checkClientMbaAccess")
  const access = await checkClientMbaAccess(request({}), MBA)
  assert.equal(access.ok, true)
})

for (const [name, body] of FIELDS) {
  test(`client in scope: ${name} is 403 and nothing is read, patched or stamped`, { skip }, async () => {
    const res = await patch(CLIENT_IN_SCOPE, body)
    assert.equal(res.status, 403)
    assert.equal(readMasterMock.mock.calls.length, 0)
    assert.equal(updates.length, 0)
    assert.equal(stampMock.mock.calls.length, 0)
  })

  test(`staff: ${name} still changes`, { skip }, async () => {
    const res = await patch(STAFF, body)
    assert.equal(res.status, 200)
    if ("version_number" in body) {
      assert.equal(stampMock.mock.calls.length, 1)
      assert.ok(updates.some((u) => (u as { publishedVersionId?: number }).publishedVersionId === 77))
    } else {
      assert.equal(updates.length, 1)
      assert.equal(stampMock.mock.calls.length, 0)
    }
  })
}

test("no session is 401", { skip }, async () => {
  const res = await patch(null as unknown as Record<string, unknown>, { mp_campaignname: "x" })
  assert.equal(res.status, 401)
  assert.equal(updates.length, 0)
})
