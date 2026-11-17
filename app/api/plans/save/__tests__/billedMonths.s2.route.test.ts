/**
 * S2 A (B56): the save route passes the billed months choice to
 * savePlanVersion and answers its BILLED_MONTHS_ refusals with a 409 that
 * carries the months, and nothing after the refused save runs. The gate
 * itself is driven in lib/data/__tests__/savePlan.billedMonths.s2.test.ts.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import { schema as realSchema } from "../../../../../db"

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

const billedMonths = [
  { month: "2026-09", reasons: ["xero_matched"], baseCents: 100000, candidateCents: 80000, deltaCents: -20000, changed: true, lines: [] },
]
let refusal: string | null = "BILLED_MONTHS_CHOICE_REQUIRED"
const savePlanVersionMock = mock.fn(async (input: { billedMonthsChoice?: string | null }) => {
  if (refusal) throw new MockSavePlanError(refusal, `refused ${input.billedMonthsChoice ?? "none"}`, undefined, { billedMonths })
  return { versionId: 9, versionNumber: 41, lineCount: 1, scheduleRowCount: 2, published: true, documents: { status: "skipped" } }
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

function postReq(choice?: string) {
  return new NextRequest("http://localhost/api/plans/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      masterId: MASTER_ID,
      mbaNumber: MBA,
      versionNumber: 41,
      mode: "publish",
      campaignStartDate: "2026-09-01",
      campaignEndDate: "2026-10-31",
      lineItems: [
        {
          lineItemId: "golf025SM4",
          channel: "social",
          mediaType: "socialMedia",
          platform: "Meta",
          publisher: "Meta",
          buyType: "cpm",
          rate: 1,
          enteredAmount: 1000,
          bursts: [{ startDate: "2026-09-01", endDate: "2026-10-31", budget: 1000, buyAmount: 1, calculatedValue: 1000 }],
        },
      ],
      feeLoading: { feesocial: 10 },
      baseVersionId: 140,
      tipVersionIdAtLoad: 140,
      ...(choice !== undefined ? { billedMonthsChoice: choice } : {}),
    }),
  })
}

for (const code of ["BILLED_MONTHS_CHOICE_REQUIRED", "BILLED_MONTHS_CREDIT_UNAVAILABLE", "BILLED_MONTHS_KEEP_FAILED"]) {
  test(`save route: ${code} is a 409 that carries the months; nothing after the save runs`, { skip }, async () => {
    refusal = code
    completeStagedIngestAfterSaveMock.mock.resetCalls()
    const { POST } = await import("../route.js")
    const res = await POST(postReq())
    assert.equal(res.status, 409)
    const json = (await res.json()) as { code?: string; billedMonths?: unknown }
    assert.equal(json.code, code)
    assert.deepEqual(json.billedMonths, billedMonths)
    assert.equal(completeStagedIngestAfterSaveMock.mock.calls.length, 0)
  })
}

test("save route: the choice reaches savePlanVersion; an unknown choice is a 400", { skip }, async () => {
  refusal = null
  savePlanVersionMock.mock.resetCalls()
  const { POST } = await import("../route.js")
  assert.equal((await POST(postReq("keep"))).status, 200)
  assert.equal(savePlanVersionMock.mock.calls.at(-1)?.arguments[0].billedMonthsChoice, "keep")
  assert.equal((await POST(postReq())).status, 200)
  assert.equal(savePlanVersionMock.mock.calls.at(-1)?.arguments[0].billedMonthsChoice, null)
  const calls = savePlanVersionMock.mock.calls.length
  assert.equal((await POST(postReq("drop"))).status, 400)
  assert.equal(savePlanVersionMock.mock.calls.length, calls)
})
