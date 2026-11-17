/**
 * S1 A (B54): the PATCH publish stamp on /api/mediaplans/mba/[mba_number]
 * runs the publish validation set on the version's stored lines before any
 * write. On: a refused version is 422 and nothing is stamped or patched.
 * Off: the stamp runs, as before.
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

const stampMock = mock.fn(async () => ({ stamped: true, versionId: 77 }))
const updates: unknown[] = []
const versionLines = [
  {
    campaign_start_date: "2026-11-01",
    campaign_end_date: "2026-11-30",
    line_item_id: "test001TV1",
    channel: "television",
    buy_type: "spots",
    publisher: null,
    platform: null,
    attrs: { network: "" },
    bursts: [{ startDate: "2026-11-01", endDate: "2026-11-30", budget: 100, calculatedValue: 10 }],
  },
]

const fakeDb = {
  execute: async () => versionLines,
  update: () => ({
    set: (v: unknown) => ({
      where: async () => {
        updates.push(v)
      },
    }),
  }),
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: async () => ({ user: { email: "planner@example.com", "https://assembledview.com/roles": ["admin"] } }) },
    },
  })
  const realRead = await import("../../../../../../lib/data/readMediaPlans")
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      ...realRead,
      readPlanMasterByMba: async () => ({ id: 5, mba_number: MBA, campaign_status: "booked" }),
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
    namedExports: { getCurrentUser: async () => ({ email: "planner@example.com" }) },
  })
  await mock.module!("@/db", { namedExports: { getDb: () => fakeDb, schema: realSchema } })
}

const row = (on: boolean): FeatureRow => ({
  key: "publish_validation",
  enabled: on,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  note: null,
})

afterEach(() => setFeatureRowReaderForTests(null))

async function patch(on: boolean) {
  setFeatureRowReaderForTests(async () => new Map([["publish_validation", row(on)]]))
  stampMock.mock.resetCalls()
  updates.length = 0
  const { PATCH } = await import("../route.js")
  return PATCH(
    new NextRequest(`http://localhost/api/mediaplans/mba/${MBA}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version_number: 2, mp_campaignname: "New name" }),
    }),
    { params: Promise.resolve({ mba_number: MBA }) },
  )
}

test("on: a version with a refused line is 422 and nothing is stamped or patched", { skip }, async () => {
  const res = await patch(true)
  assert.equal(res.status, 422)
  const body = (await res.json()) as { code?: string; lineItemIds?: string[] }
  assert.equal(body.code, "PUBLISH_VALIDATION_REFUSED")
  assert.deepEqual(body.lineItemIds, ["test001TV1"])
  assert.equal(stampMock.mock.calls.length, 0)
  assert.equal(updates.length, 0)
})

test("off: the stamp and the pointer move run, as before", { skip }, async () => {
  const res = await patch(false)
  assert.notEqual(res.status, 422)
  assert.equal(stampMock.mock.calls.length, 1)
  assert.ok(updates.some((u) => (u as { publishedVersionId?: number }).publishedVersionId === 77))
})
