/**
 * SV-1 — STALE_BASE_VERSION checks tip-at-load vs tip-now, not the chosen base.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import { schema as realSchema } from "../../../../../db"

const skip = mockModuleSkip()

const MASTER_ID = 100
const MBA = "sv1fork01"
const BASE_V3_ID = 30
const TIP_V5_ID = 50
const TIP_V6_ID = 60
const LINE_FROM_V3 = `${MBA.toUpperCase()}SEA001`

let currentPublishedId: number | null = TIP_V5_ID
let lastSaveInput: { lineItems?: Array<{ lineItemId: string }>; baseVersionId?: number | null } | null =
  null

const requireRoleMock = mock.fn(async () => ({
  session: { user: { email: "luke@assembledmedia.com.au" } },
  roles: ["admin"] as const,
  clientSlug: null,
  grantedByAllowlist: false,
}))

const checkClientMbaAccessMock = mock.fn(async () => ({ ok: true as const, isClient: false }))

const getWriteBackendMock = mock.fn(() => "postgres" as const)
const isXanoMirrorEnabledMock = mock.fn(() => false)

const resolvePublishedVersionIdMock = mock.fn(async (_masterId: number) => currentPublishedId)
const countVersionLinesMock = mock.fn(async (_id: number) => 4)
const getWorkingDraftMock = mock.fn(async () => null)
const deleteWorkingDraftMock = mock.fn(async () => undefined)

const savePlanVersionMock = mock.fn(async (input: { lineItems: Array<{ lineItemId: string }>; baseVersionId?: number | null }) => {
  lastSaveInput = input
  return {
    versionId: 110,
    versionNumber: 6,
    lineCount: input.lineItems.length,
    scheduleRowCount: 1,
    published: true,
    legacySchedules: { billingSchedule: [], deliverySchedule: [] },
  }
})

const completeStagedIngestAfterSaveMock = mock.fn(async () => ({ ingestStageRetained: false }))

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

const getDbMock = mock.fn(() =>
  drizzleSelectLimit([{ id: MASTER_ID, mbaNumber: MBA }])
)

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireRole: requireRoleMock },
  })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: checkClientMbaAccessMock },
  })
  await mock.module!("@/lib/data/backend", {
    namedExports: {
      getWriteBackend: getWriteBackendMock,
      isXanoMirrorEnabled: isXanoMirrorEnabledMock,
    },
  })
  await mock.module!("@/lib/mediaplan/drafts/serverStore", {
    namedExports: {
      resolvePublishedVersionId: resolvePublishedVersionIdMock,
      countVersionLines: countVersionLinesMock,
      getWorkingDraft: getWorkingDraftMock,
      deleteWorkingDraft: deleteWorkingDraftMock,
    },
  })
  await mock.module!("@/lib/data/savePlan", {
    namedExports: {
      savePlanVersion: savePlanVersionMock,
      SavePlanError: class SavePlanError extends Error {
        code: string
        constructor(code: string, message: string) {
          super(message)
          this.code = code
        }
      },
    },
  })
  await mock.module!("@/lib/mediaplans/ingest/completeStagedIngestAfterSave", {
    namedExports: {
      completeStagedIngestAfterSave: completeStagedIngestAfterSaveMock,
    },
  })
  await mock.module!("@/db", {
    namedExports: {
      getDb: getDbMock,
      schema: realSchema,
    },
  })
}

async function loadRoute() {
  const mod = await import("../route.js")
  if (!mod.POST) throw new Error("save route missing POST")
  return mod.POST as (req: NextRequest) => Promise<Response>
}

function saveBody(over: Record<string, unknown> = {}) {
  return {
    masterId: MASTER_ID,
    mbaNumber: MBA,
    versionNumber: 6,
    mode: "publish",
    lineItems: [
      {
        lineItemId: LINE_FROM_V3,
        channel: "search",
        mediaType: "search",
        rate: 1,
        enteredAmount: 1500,
        bursts: [],
      },
    ],
    feeLoading: { feesearch: 10 },
    baseVersionId: BASE_V3_ID,
    tipVersionIdAtLoad: TIP_V5_ID,
    ...over,
  }
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/plans/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function reset() {
  currentPublishedId = TIP_V5_ID
  lastSaveInput = null
  savePlanVersionMock.mock.resetCalls()
  resolvePublishedVersionIdMock.mock.resetCalls()
  countVersionLinesMock.mock.resetCalls()
}

test("SV-1 route: base v3, tip-at-load v5, tip-now v5 → 200 and v6 written from the body", { skip }, async () => {
  reset()
  currentPublishedId = TIP_V5_ID
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody()))
  assert.equal(res.status, 200)
  const json = (await res.json()) as { versionNumber?: number; code?: string }
  assert.equal(json.versionNumber, 6)
  assert.equal(savePlanVersionMock.mock.calls.length, 1)
  assert.equal(lastSaveInput?.lineItems?.[0]?.lineItemId, LINE_FROM_V3)
  assert.equal(lastSaveInput?.baseVersionId, BASE_V3_ID)
})

test("SV-1 route: base v3, tip-at-load v5, tip-now v6 → 409 STALE_BASE_VERSION", { skip }, async () => {
  reset()
  currentPublishedId = TIP_V6_ID
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody()))
  assert.equal(res.status, 409)
  const json = (await res.json()) as {
    code?: string
    compare?: { baseVersionId: number; currentVersionId: number }
  }
  assert.equal(json.code, "STALE_BASE_VERSION")
  assert.equal(json.compare?.baseVersionId, TIP_V5_ID)
  assert.equal(json.compare?.currentVersionId, TIP_V6_ID)
  assert.equal(savePlanVersionMock.mock.calls.length, 0)
})

test("SV-1 route: create (no tip) → 200", { skip }, async () => {
  reset()
  currentPublishedId = null
  const POST = await loadRoute()
  const res = await POST(
    postReq(
      saveBody({
        baseVersionId: null,
        tipVersionIdAtLoad: null,
      })
    )
  )
  assert.equal(res.status, 200)
  const json = (await res.json()) as { versionNumber?: number }
  assert.equal(json.versionNumber, 6)
  assert.equal(savePlanVersionMock.mock.calls.length, 1)
})
