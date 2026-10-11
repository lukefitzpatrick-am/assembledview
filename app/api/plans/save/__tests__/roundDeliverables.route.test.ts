/**
 * Derived burst quantities are rounded before savePlanVersion, on every mode.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import { schema as realSchema } from "../../../../../db"

const skip = mockModuleSkip()

const MASTER_ID = 100
const MBA = "krusty002"
const TIP_ID = 50
const LINE_ID = "KRUSTY002DD001"

let lastSaveInput: {
  lineItems?: Array<{ lineItemId: string; bursts?: unknown }>
} | null = null

const requireRoleMock = mock.fn(async () => ({
  session: { user: { email: "luke@assembledmedia.com.au" } },
  roles: ["admin"] as const,
  clientSlug: null,
  grantedByAllowlist: false,
}))

const checkClientMbaAccessMock = mock.fn(async () => ({ ok: true as const, isClient: false }))
const getWriteBackendMock = mock.fn(() => "postgres" as const)
const resolvePublishedVersionIdMock = mock.fn(async () => TIP_ID)
const countVersionLinesMock = mock.fn(async () => 1)
const getWorkingDraftMock = mock.fn(async () => null)
const deleteWorkingDraftMock = mock.fn(async () => undefined)

const savePlanVersionMock = mock.fn(async (input: { lineItems: Array<{ lineItemId: string; bursts?: unknown }> }) => {
  lastSaveInput = input
  return {
    versionId: 110,
    versionNumber: 2,
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

const getDbMock = mock.fn(() => drizzleSelectLimit([{ id: MASTER_ID, mbaNumber: MBA }]))

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireRole: requireRoleMock },
  })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: checkClientMbaAccessMock },
  })
  await mock.module!("@/lib/data/backend", {
    namedExports: { getWriteBackend: getWriteBackendMock },
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
    namedExports: { completeStagedIngestAfterSave: completeStagedIngestAfterSaveMock },
  })
  await mock.module!("@/db", {
    namedExports: { getDb: getDbMock, schema: realSchema },
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
    versionNumber: 2,
    mode: "publish",
    lineItems: [
      {
        lineItemId: LINE_ID,
        channel: "digi_display",
        mediaType: "digi_display",
        buyType: "cpm",
        rate: 15,
        enteredAmount: 3000,
        bursts: [
          {
            budget: "3000",
            buyAmount: "15",
            calculatedValue: 10.6,
            startDate: "2026-01-01",
            endDate: "2026-01-31",
          },
        ],
      },
    ],
    feeLoading: { feedigitaldisplay: 10 },
    baseVersionId: TIP_ID,
    tipVersionIdAtLoad: TIP_ID,
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
  lastSaveInput = null
  savePlanVersionMock.mock.resetCalls()
}

test("publish rounds the sent CPM calculatedValue before savePlanVersion", { skip }, async () => {
  reset()
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody()))
  assert.equal(res.status, 200)
  const bursts = lastSaveInput?.lineItems?.[0]?.bursts as Array<{ calculatedValue: number }>
  assert.equal(bursts[0]?.calculatedValue, 11)
})

test("draft rounds the sent CPM calculatedValue before savePlanVersion", { skip }, async () => {
  reset()
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody({ mode: "draft" })))
  assert.equal(res.status, 200)
  const bursts = lastSaveInput?.lineItems?.[0]?.bursts as Array<{ calculatedValue: number }>
  assert.equal(bursts[0]?.calculatedValue, 11)
})
