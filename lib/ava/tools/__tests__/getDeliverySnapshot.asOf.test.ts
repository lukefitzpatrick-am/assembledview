import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const attachStripExpectedMock = mock.fn(
  async (input: { stripInputs: { monthlyOpts?: { asOfISO?: string } } }) => ({
    expectedSpendToDate: 1,
    behindBy: 0,
    daysElapsed: 71,
    daysInCampaign: 86,
    daysRemaining: 15,
    seenAsOfISO: input.stripInputs.monthlyOpts?.asOfISO,
  }),
)

if (supportsMockModule()) {
  await mock.module!("@/lib/delivery/loadDeliverySnapshot", {
    namedExports: {
      loadDeliverySnapshot: async () => ({
        asOf: "2026-10-10",
        versionNumber: 28,
        mbaNumber: "bicau002",
        window: { startDate: "2026-08-01", endDate: "2026-10-25" },
        channels: [],
        planTotals: {
          spendToDate: 79884.21,
          impressions: 0,
          clicks: 0,
          results: 0,
          video3sViews: 0,
          plannedBudget: 102402.1,
          cpm: null,
          ctr: null,
          cpc: null,
        },
      }),
    },
  })
  await mock.module!("@/lib/ava/tools/summaries", {
    namedExports: {
      summariseDeliverySnapshot: () => ({
        reportedTotals: { spendToDate: 79884.21 },
      }),
    },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      readPlanVersionsByMba: async () => [
        {
          version_number: 28,
          published_at: "2026-08-01T00:00:00Z",
          campaign_start_date: "2026-08-01",
          campaign_end_date: "2026-10-25",
          billingSchedule: [],
          deliverySchedule: [{ month: "August 2026", mediaCosts: { social: "$1.00" } }],
        },
      ],
    },
  })
  await mock.module!("@/lib/delivery/attachStripExpected", {
    namedExports: {
      attachStripExpected: attachStripExpectedMock,
    },
  })
}

test("get_delivery_snapshot passes the Melbourne as-of into monthlyOpts.asOfISO", { skip }, async () => {
  attachStripExpectedMock.mock.resetCalls()
  const { getDeliverySnapshotTool } = await import("../getDeliverySnapshot.js")
  const result = await getDeliverySnapshotTool.execute(
    {},
    {
      pageContext: undefined,
      clientSlug: undefined,
      mbaNumber: "bicau002",
      versionNumber: 28,
      enabledMediaTypes: undefined,
      userSub: undefined,
      userEmail: "admin@example.com",
      roles: ["admin"],
      clientSlugs: [],
      mbaNumbers: [],
      capturedPatch: null,
      capturedAttachments: null,
      capturedQuestions: null,
      pendingParsedPlan: null,
      capturedLineItemsLoad: null,
      currentLineItems: null,
    },
  )
  assert.equal(result.isError, undefined)
  assert.equal(attachStripExpectedMock.mock.calls.length, 1)
  const arg = attachStripExpectedMock.mock.calls[0]!.arguments[0] as {
    asOf: string
    stripInputs: { monthlyOpts?: { asOfISO?: string; basis?: string } }
  }
  assert.equal(arg.asOf, "2026-10-10")
  assert.equal(arg.stripInputs.monthlyOpts?.asOfISO, "2026-10-10")
})
