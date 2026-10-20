import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { DELIVERY_SNAPSHOT_TOTALS_NOTE } from "../summaries.js"

const skip = mockModuleSkip()

const loadCalls: Array<Record<string, unknown>> = []
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

// CF5: conversions loader. Null = the client's switch is off.
let conversionsLoaded: unknown = null
const conversionCalls: Array<Record<string, unknown>> = []

if (supportsMockModule()) {
  await mock.module!("@/lib/delivery/conversions/loadConversions", {
    namedExports: {
      loadConversionsForLines: async (input: Record<string, unknown>) => (conversionCalls.push(input), conversionsLoaded),
    },
  })
  await mock.module!("@/lib/delivery/loadDeliverySnapshot", {
    namedExports: {
      loadDeliverySnapshot: async (input: Record<string, unknown>) => (loadCalls.push(input), {
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
      DELIVERY_SNAPSHOT_TOTALS_NOTE,
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
          campaign_end_date: "2026-09-30",
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

const context = {
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
}

type StripArg = {
  asOf: string
  window?: { startISO: string; endISO: string; filtered: boolean; empty: boolean }
  stripInputs: { monthlyOpts?: { asOfISO?: string; basis?: string } }
}

test("get_delivery_snapshot reads delivered and expected on the strip window", { skip }, async () => {
  attachStripExpectedMock.mock.resetCalls()
  loadCalls.length = 0
  const { getDeliverySnapshotTool } = await import("../getDeliverySnapshot.js")
  const result = await getDeliverySnapshotTool.execute({}, context as never)
  assert.equal(result.isError, undefined)
  // Campaign ended 30 Sep, so the window is the whole flight to the end date.
  assert.deepEqual(
    { startDate: loadCalls[0]!.startDate, endDate: loadCalls[0]!.endDate },
    { startDate: "2026-08-01", endDate: "2026-09-30" },
  )
  assert.equal(attachStripExpectedMock.mock.calls.length, 1)
  const arg = attachStripExpectedMock.mock.calls[0]!.arguments[0] as StripArg
  assert.equal(arg.asOf, "2026-09-30")
  assert.equal(arg.stripInputs.monthlyOpts?.asOfISO, "2026-09-30")
  assert.equal(arg.window?.startISO, "2026-08-01")
  assert.equal(arg.window?.endISO, "2026-09-30")
  assert.equal(arg.window?.filtered, false)
  const body = JSON.parse(String(result.content).replace(/^```json\n|\n```$/g, ""))
  assert.equal(body.deliveredThrough, "2026-09-30")
})

test("get_delivery_snapshot applies a requested range to both reads", { skip }, async () => {
  attachStripExpectedMock.mock.resetCalls()
  loadCalls.length = 0
  const { getDeliverySnapshotTool } = await import("../getDeliverySnapshot.js")
  await getDeliverySnapshotTool.execute({ startDate: "2026-09-01", endDate: "2026-09-15" }, context as never)
  assert.deepEqual(
    { startDate: loadCalls[0]!.startDate, endDate: loadCalls[0]!.endDate },
    { startDate: "2026-09-01", endDate: "2026-09-15" },
  )
  const arg = attachStripExpectedMock.mock.calls[0]!.arguments[0] as StripArg
  assert.equal(arg.window?.filtered, true)
  assert.equal(arg.window?.endISO, "2026-09-15")
})

test("toolPacingWindow stops at Melbourne yesterday and pairs one-sided ranges", { skip }, async () => {
  const { toolPacingWindow, snapshotRange } = await import("../getDeliverySnapshot.js")
  const reference = new Date("2026-10-20T22:00:00Z") // 21 Oct in Melbourne
  const live = toolPacingWindow({
    startArg: undefined,
    endArg: undefined,
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-12-31",
    reference,
  })
  assert.equal(live.startISO, "2026-10-01")
  assert.equal(live.endISO, "2026-10-20")
  const endOnly = toolPacingWindow({
    startArg: undefined,
    endArg: "2026-10-10",
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-12-31",
    reference,
  })
  assert.equal(endOnly.startISO, "2026-10-01")
  assert.equal(endOnly.endISO, "2026-10-10")
  const pastToday = toolPacingWindow({
    startArg: "2026-10-15",
    endArg: "2026-11-30",
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-12-31",
    reference,
  })
  assert.equal(pastToday.endISO, "2026-10-20")
  const notStarted = toolPacingWindow({
    startArg: undefined,
    endArg: undefined,
    campaignStartISO: "2026-10-21",
    campaignEndISO: "2026-12-31",
    reference,
  })
  assert.equal(notStarted.empty, true)
  assert.deepEqual(snapshotRange(notStarted, "2026-10-21", false), {
    startDate: "2026-10-20",
    endDate: "2026-10-20",
  })
  assert.deepEqual(snapshotRange(live, null, false), { endDate: "2026-10-20" })
})

test("get_delivery_snapshot says conversions are off when the client switch is off", { skip }, async () => {
  conversionsLoaded = null
  conversionCalls.length = 0
  const { getDeliverySnapshotTool } = await import("../getDeliverySnapshot.js")
  const result = await getDeliverySnapshotTool.execute({}, context as never)
  const body = JSON.parse(String(result.content).replace(/^```json\n|\n```$/g, ""))
  assert.equal(body.conversions.enabled, false)
  assert.match(body.conversions.note, /off/)
})

test("get_delivery_snapshot reads conversions on the strip window when the switch is on", { skip }, async () => {
  conversionsLoaded = {
    headline: "purchases",
    showRevenue: true,
    trackedPlatforms: ["meta_ads"],
    valuePlatforms: ["meta_ads"],
    throughDate: "2026-09-15",
    lines: [],
  }
  conversionCalls.length = 0
  const { getDeliverySnapshotTool } = await import("../getDeliverySnapshot.js")
  const result = await getDeliverySnapshotTool.execute({ startDate: "2026-09-01", endDate: "2026-09-15" }, context as never)
  assert.equal(conversionCalls.length, 1)
  assert.equal(conversionCalls[0]!.startDate, "2026-09-01")
  assert.equal(conversionCalls[0]!.endDate, "2026-09-15")
  assert.equal(conversionCalls[0]!.mbaNumber, "bicau002")
  const body = JSON.parse(String(result.content).replace(/^```json\n|\n```$/g, ""))
  assert.equal(body.conversions.enabled, true)
  assert.equal(body.conversions.label, "Purchases")
  assert.equal(body.conversions.through, "2026-09-15")
  conversionsLoaded = null
})
