/**
 * S1 A (B54): savePlanVersion's publish validation refusal comes back from
 * POST /api/plans/save as a 422 listing each problem, and nothing after the
 * refused save runs. The check itself is driven in
 * lib/mediaplan/__tests__/publishValidation.server.s1.test.ts.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import { schema as realSchema } from "../../../../../db"
import { publishRefusalBody, validatePlanForPublish } from "../../../../../lib/mediaplan/publishValidation.js"

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

const savePlanVersionMock = mock.fn(
  async (input: { campaignStartDate?: string | null; campaignEndDate?: string | null; lineItems: Array<{ lineItemId: string; channel: string }> }) => {
    const { refuse } = validatePlanForPublish(input)
    const body = publishRefusalBody(refuse)
    throw new MockSavePlanError("PUBLISH_VALIDATION_REFUSED", body.error, undefined, { ...body })
  },
)

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

function postReq() {
  return new NextRequest("http://localhost/api/plans/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      masterId: MASTER_ID,
      mbaNumber: MBA,
      versionNumber: 41,
      mode: "publish",
      campaignStartDate: "2026-10-01",
      campaignEndDate: "2026-10-31",
      lineItems: [
        {
          lineItemId: "golf025SM4",
          channel: "social",
          mediaType: "socialMedia",
          platform: "Meta",
          buyType: "cpm",
          rate: 1,
          enteredAmount: 1000,
          bursts: [
            { startDate: "2026-10-01", endDate: "2026-10-20", budget: 500, buyAmount: 1, calculatedValue: 500 },
            { startDate: "2026-10-15", endDate: "2026-11-05", budget: 500, buyAmount: 1, calculatedValue: 500 },
          ],
        },
      ],
      feeLoading: { feesocial: 10 },
      baseVersionId: 140,
      tipVersionIdAtLoad: 140,
    }),
  })
}

test("save route: PUBLISH_VALIDATION_REFUSED is a 422 that lists each problem; nothing after the save runs", { skip }, async () => {
  completeStagedIngestAfterSaveMock.mock.resetCalls()
  const { POST } = await import("../route.js")
  const res = await POST(postReq())
  assert.equal(res.status, 422)
  const json = (await res.json()) as {
    code?: string
    error?: string
    lineItemIds?: string[]
    publishProblems?: Array<{ rule: string; lineItemId: string; burst: number | null }>
  }
  assert.equal(json.code, "PUBLISH_VALIDATION_REFUSED")
  assert.deepEqual(json.lineItemIds, ["golf025SM4"])
  assert.deepEqual(
    json.publishProblems?.map((p) => [p.rule, p.burst]),
    [
      ["burst_outside_plan_dates", 2],
      ["bursts_overlap", 2],
    ],
  )
  assert.match(json.error ?? "", /golf025SM4/)
  assert.equal(completeStagedIngestAfterSaveMock.mock.calls.length, 0)
})
