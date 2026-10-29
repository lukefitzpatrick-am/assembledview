/**
 * Never reuse a line id (Luke, 29 Oct 2026): the save route turns
 * `LINE_ITEM_ID_RETIRED` from `savePlanVersion` into a 409 that names the ids
 * and carries the plan floors, and runs nothing after the refused save.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import { schema as realSchema } from "../../../../../db"
import {
  findRetiredLineIdReuse,
  retiredLineIdMessage,
} from "../../../../../lib/mediaplan/retiredLineIds.js"

const skip = mockModuleSkip()

const MASTER_ID = 200
const MBA = "golf025"

class MockSavePlanError extends Error {
  code: string
  lineItemId?: string
  details?: Record<string, unknown>
  constructor(code: string, message: string, lineItemId?: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.lineItemId = lineItemId
    this.details = details
  }
}

let refuse = true

const savePlanVersionMock = mock.fn(async (input: { lineItems: Array<{ lineItemId: string }> }) => {
  if (refuse) {
    const reuse = findRetiredLineIdReuse({
      versions: [
        { versionId: 109, versionNumber: 9 },
        { versionId: 140, versionNumber: 40 },
      ],
      rows: [
        { versionId: 109, lineItemId: "golf025SM5" },
        { versionId: 140, lineItemId: "golf025SM4" },
      ],
      continuingVersionIds: [140],
      incomingLineItemIds: input.lineItems.map((l) => l.lineItemId),
    })
    throw new MockSavePlanError(
      "LINE_ITEM_ID_RETIRED",
      retiredLineIdMessage(reuse),
      reuse[0]?.lineItemId,
      { retiredLineItemIds: reuse, lineIdFloors: { SM: 5 } },
    )
  }
  return {
    versionId: 141,
    versionNumber: 41,
    lineCount: input.lineItems.length,
    scheduleRowCount: 1,
    published: true,
    legacySchedules: { billingSchedule: [], deliverySchedule: [] },
  }
})

const completeStagedIngestAfterSaveMock = mock.fn(async () => ({ ingestStageRetained: false }))
const getWorkingDraftMock = mock.fn(async () => null)

function drizzleSelectLimit(rows: Array<{ id: number; mbaNumber: string }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: mock.fn(async () => ({
        session: { user: { email: "luke@assembledmedia.com.au" } },
        roles: ["admin"] as const,
        clientSlug: null,
        grantedByAllowlist: false,
      })),
    },
  })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: mock.fn(async () => ({ ok: true as const, isClient: false })) },
  })
  await mock.module!("@/lib/data/backend", {
    namedExports: { getWriteBackend: mock.fn(() => "postgres" as const) },
  })
  await mock.module!("@/lib/mediaplan/drafts/serverStore", {
    namedExports: {
      resolvePublishedVersionId: mock.fn(async () => 140),
      countVersionLines: mock.fn(async () => 1),
      getWorkingDraft: getWorkingDraftMock,
      deleteWorkingDraft: mock.fn(async () => undefined),
    },
  })
  await mock.module!("@/lib/data/savePlan", {
    namedExports: {
      savePlanVersion: savePlanVersionMock,
      SavePlanError: MockSavePlanError,
    },
  })
  await mock.module!("@/lib/mediaplans/ingest/completeStagedIngestAfterSave", {
    namedExports: { completeStagedIngestAfterSave: completeStagedIngestAfterSaveMock },
  })
  await mock.module!("@/db", {
    namedExports: {
      getDb: mock.fn(() => drizzleSelectLimit([{ id: MASTER_ID, mbaNumber: MBA }])),
      schema: realSchema,
    },
  })
}

async function loadRoute() {
  const mod = await import("../route.js")
  return mod.POST as (req: NextRequest) => Promise<Response>
}

function line(lineItemId: string) {
  return {
    lineItemId,
    channel: "social",
    mediaType: "socialMedia",
    buyType: "cpm",
    rate: 1,
    enteredAmount: 1000,
    bursts: [{ startDate: "2026-10-01", endDate: "2026-10-31", budget: 1000, buyAmount: 1 }],
  }
}

function postReq(lineItemIds: string[]) {
  return new NextRequest("http://localhost/api/plans/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      masterId: MASTER_ID,
      mbaNumber: MBA,
      versionNumber: 41,
      mode: "publish",
      lineItems: lineItemIds.map(line),
      feeLoading: { feesocial: 10 },
      baseVersionId: 140,
      tipVersionIdAtLoad: 140,
    }),
  })
}

test("save route: retired id → 409 LINE_ITEM_ID_RETIRED with ids, versions and floors", { skip }, async () => {
  refuse = true
  savePlanVersionMock.mock.resetCalls()
  completeStagedIngestAfterSaveMock.mock.resetCalls()
  const POST = await loadRoute()
  const res = await POST(postReq(["golf025SM4", "golf025SM5"]))
  assert.equal(res.status, 409)
  const json = (await res.json()) as {
    code?: string
    error?: string
    lineItemId?: string
    retiredLineItemIds?: Array<{ lineItemId: string; lastVersionNumber: number }>
    lineIdFloors?: Record<string, number>
  }
  assert.equal(json.code, "LINE_ITEM_ID_RETIRED")
  assert.equal(json.lineItemId, "golf025SM5")
  assert.deepEqual(json.retiredLineItemIds, [{ lineItemId: "golf025SM5", lastVersionNumber: 9 }])
  assert.deepEqual(json.lineIdFloors, { SM: 5 })
  assert.match(json.error ?? "", /golf025SM5 \(last used in v9\)/)
  assert.equal(completeStagedIngestAfterSaveMock.mock.calls.length, 0)
})

test("save route: continuing ids save normally (200)", { skip }, async () => {
  refuse = false
  const POST = await loadRoute()
  const res = await POST(postReq(["golf025SM4", "golf025SM6"]))
  assert.equal(res.status, 200)
  const json = (await res.json()) as { versionNumber?: number; code?: string }
  assert.equal(json.versionNumber, 41)
  assert.equal(json.code, undefined)
})
