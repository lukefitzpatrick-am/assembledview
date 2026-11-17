/**
 * S2 A (B56): the PATCH publish stamp makes a stored version the tip as it
 * is, so it cannot keep billed rows. With `billed_months_choice` on, a version
 * whose billing differs in an invoiced month is 409 and nothing is stamped or
 * patched; one that keeps invoiced months as billed goes on. Off: as before.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { NextRequest } from "next/server"

import { schema as realSchema } from "../../../../../../db"
import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness"
import type { FeatureRow } from "../../../../../../lib/features/registry"
import { setFeatureRowReaderForTests } from "../../../../../../lib/features/server"
import { penfold022V3Blob } from "../../../../../../lib/finance/revisions/__tests__/blobFixtures"

const skip = mockModuleSkip()
const MBA = "penfold022"

const stampMock = mock.fn(async () => ({ stamped: true, versionId: 77 }))
const updates: unknown[] = []
/** The version being stamped: the tip with November billed $1,000.00 less on one line. */
let target: unknown = null
const lowerNovember = () => {
  const blob = penfold022V3Blob() as Array<{ monthYear: string; lineItems: Record<string, Array<Record<string, unknown>>> }>
  const lineItems = structuredClone(blob[0]!.lineItems)
  const sm1 = lineItems.socialMedia!.find((l) => l.id === "penfold022SM1")!
  sm1.monthlyAmounts = { ...(sm1.monthlyAmounts as Record<string, number>), "November 2026": 3017.86 }
  sm1.totalAmount = 6500
  blob[0] = { ...blob[0]!, lineItems }
  return blob
}

const fakeDb = {
  execute: async () => [{ schedule: target }],
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
      readPlanVersionsByMba: async () => [{ id: 77, version_number: 4 }],
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
  await mock.module!("@/lib/finance/billedMonths/load", {
    namedExports: {
      loadBilledMonthsBase: async () => ({
        base: { versionId: 70, schedule: penfold022V3Blob(), rows: [] },
        invoiced: [{ month: "2026-11", reasons: ["xero_matched"] }],
      }),
    },
  })
  await mock.module!("@/db", { namedExports: { getDb: () => fakeDb, schema: realSchema } })
}

const row = (on: boolean): FeatureRow => ({
  key: "billed_months_choice",
  enabled: on,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  note: null,
})

afterEach(() => setFeatureRowReaderForTests(null))

async function patch(on: boolean, version: unknown) {
  setFeatureRowReaderForTests(async () => new Map([["billed_months_choice", row(on)]]))
  target = version
  stampMock.mock.resetCalls()
  updates.length = 0
  const { PATCH } = await import("../route.js")
  return PATCH(
    new NextRequest(`http://localhost/api/mediaplans/mba/${MBA}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version_number: 4, mp_campaignname: "New name" }),
    }),
    { params: Promise.resolve({ mba_number: MBA }) },
  )
}

test("on: a version that changes an invoiced month is 409 and nothing is stamped or patched", { skip }, async () => {
  const res = await patch(true, lowerNovember())
  assert.equal(res.status, 409)
  const body = (await res.json()) as { code?: string; billedMonths?: Array<{ month: string; deltaCents: number }> }
  assert.equal(body.code, "BILLED_MONTHS_CHANGED")
  assert.deepEqual(body.billedMonths?.map((m) => [m.month, m.deltaCents]), [["2026-11", -100000]])
  assert.equal(stampMock.mock.calls.length, 0)
  assert.equal(updates.length, 0)
})

test("on: a version that bills invoiced months as the tip does is stamped", { skip }, async () => {
  const res = await patch(true, penfold022V3Blob())
  assert.equal(res.status, 200)
  assert.equal(stampMock.mock.calls.length, 1)
})

test("off: the stamp and the pointer move run, as before", { skip }, async () => {
  const res = await patch(false, lowerNovember())
  assert.equal(res.status, 200)
  assert.equal(stampMock.mock.calls.length, 1)
  assert.ok(updates.some((u) => (u as { publishedVersionId?: number }).publishedVersionId === 77))
})
