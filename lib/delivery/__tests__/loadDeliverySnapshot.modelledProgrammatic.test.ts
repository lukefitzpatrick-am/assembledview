/**
 * REP-1 (Luke 28 Oct 2026, option c). The report snapshot carries the
 * dashboard's modelled spend for CM360 programmatic lines
 * (`derive_spend_from_plan`). sinch001-shaped data: PD and PV lines on
 * "Quantcast - Direct", $0 platform spend, impressions present.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { classifySocialPacingPlatform } from "../../pacing/social/classifySocialPacingPlatform.js"

const skip = mockModuleSkip()

type Row = {
  channel: string
  dateDay: string
  lineItemId: string
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
}

let factRows: Row[] = []

const getCampaignPacingData = mock.fn(
  async (
    _mba: string,
    ids: string[],
    params?: { startDate?: string; endDate?: string },
  ) =>
    factRows.filter(
      (row) =>
        ids.includes(row.lineItemId) &&
        (!params?.startDate || row.dateDay >= params.startDate) &&
        (!params?.endDate || row.dateDay <= params.endDate),
    ),
)
const getSearchPacingData = mock.fn(async () => null)
const queryDailyFacts = mock.fn(async () => [])

if (supportsMockModule()) {
  await mock.module!("@/lib/data/backend", {
    namedExports: { getDataBackendFor: () => "postgres" },
  })
  await mock.module!("@/lib/snowflake/pacing-service", {
    namedExports: { getCampaignPacingData },
  })
  await mock.module!("@/lib/snowflake/search-pacing-service", {
    namedExports: { getSearchPacingData },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { queryDailyFacts },
  })
  await mock.module!("@/lib/pacing/social/resolveLiveSocialLineItems", {
    namedExports: { classifySocialPacingPlatform },
  })
}

const sinchLines = {
  progDisplay: [
    {
      line_item_id: "sinch001pd1",
      name: "Quantcast display",
      platform: "Quantcast - Direct",
      buy_type: "cpm",
      fixed_cost_media: false,
      bursts: [
        {
          fee: 0,
          budget: "$8,000.00",
          startDate: "2026-07-14T14:00:00.000Z",
          endDate: "2026-11-29T13:00:00.000Z",
          buyAmount: "$7.00",
          calculatedValue: 1142857,
        },
      ],
    },
  ],
  progVideo: [
    {
      line_item_id: "sinch001pv1",
      name: "Quantcast video",
      platform: "Quantcast - Direct",
      buy_type: "cpm",
      fixed_cost_media: false,
      bursts: [
        {
          fee: 0,
          budget: "$20,000.00",
          startDate: "2026-07-27T14:00:00.000Z",
          endDate: "2026-11-29T13:00:00.000Z",
          buyAmount: "$55.00",
          calculatedValue: 363636,
        },
      ],
    },
  ],
}

function row(lineItemId: string, dateDay: string, impressions: number, video3sViews = 0): Row {
  return {
    channel: "ad-serving",
    dateDay,
    lineItemId,
    amountSpent: 0,
    impressions,
    clicks: 10,
    results: 0,
    video3sViews,
  }
}

function linesById(snap: { channels: Array<{ lines: Array<{ lineItemId: string }> }> }) {
  return new Map(
    snap.channels.flatMap((ch) => ch.lines).map((line) => [line.lineItemId, line as Record<string, unknown>]),
  )
}

test("modelled spend on: CM360 PD and PV lines carry plan-rate spend as estimated", { skip }, async () => {
  const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
  factRows = [
    row("sinch001pd1", "2026-10-01", 100_000),
    row("sinch001pd1", "2026-10-02", 50_000),
    row("sinch001pv1", "2026-10-01", 10_000, 8_000),
  ]
  getCampaignPacingData.mock.resetCalls()
  const snap = await loadDeliverySnapshot({
    mbaNumber: "sinch001",
    versionNumber: 1,
    lineItemsByChannel: sinchLines,
    feePctsByVersionId: {},
    modelProgrammaticSpend: true,
  })
  const byId = linesById(snap)
  // 8,000 / 1,142,857 per impression, 150,000 impressions.
  assert.equal(byId.get("sinch001pd1")?.spendToDate, 1050)
  assert.equal(byId.get("sinch001pd1")?.spendMode, "estimated")
  assert.equal(byId.get("sinch001pd1")?.impressions, 150_000)
  // 20,000 / 363,636 per impression, 10,000 impressions.
  assert.equal(byId.get("sinch001pv1")?.spendToDate, 550)
  assert.equal(byId.get("sinch001pv1")?.spendMode, "estimated")
  assert.equal(byId.get("sinch001pv1")?.video3sViews, 8_000)
  assert.equal(snap.includesEstimatedSpend, true)
  // Window not set: no second Snowflake read.
  assert.equal(getCampaignPacingData.mock.calls.length, 1)
})

test("modelled spend matches the dashboard's programmatic line metrics", { skip }, async () => {
  const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
  const {
    buildProgrammaticLineItemMetrics,
    normalizeProgrammaticLineItems,
    mapCombinedRowToDv360,
  } = await import("../programmatic/programmaticCompute.js")
  factRows = [
    row("sinch001pd1", "2026-10-01", 123_457),
    row("sinch001pd1", "2026-10-03", 98_765),
  ]
  const snap = await loadDeliverySnapshot({
    mbaNumber: "sinch001",
    versionNumber: 1,
    lineItemsByChannel: { progDisplay: sinchLines.progDisplay },
    feePctsByVersionId: {},
    modelProgrammaticSpend: true,
  })
  const items = normalizeProgrammaticLineItems(sinchLines.progDisplay)
  const accepted = new Set(["ad-serving"])
  const metrics = buildProgrammaticLineItemMetrics(
    items,
    factRows.map((r) => mapCombinedRowToDv360(r as never, accepted)),
    ["2026-10-01", "2026-10-02", "2026-10-03"],
    "2026-10-03",
    "progdisplay",
    undefined,
    { startISO: "2026-10-01", endISO: "2026-10-03" },
  )
  const dashboardSpend = metrics[0]!.actualsDaily.reduce((sum, d) => sum + d.spend, 0)
  assert.equal(metrics[0]!.spendModelledFromPlanRate, true)
  assert.equal(linesById(snap).get("sinch001pd1")?.spendToDate, Math.round(dashboardSpend * 100) / 100)
})

test("a window after the cap was reached shows $0, like the dashboard", { skip }, async () => {
  const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
  factRows = [
    row("sinch001pd1", "2026-09-10", 1_200_000),
    row("sinch001pd1", "2026-10-05", 100_000),
  ]
  getCampaignPacingData.mock.resetCalls()
  const snap = await loadDeliverySnapshot({
    mbaNumber: "sinch001",
    versionNumber: 1,
    lineItemsByChannel: { progDisplay: sinchLines.progDisplay },
    feePctsByVersionId: {},
    startDate: "2026-10-01",
    endDate: "2026-10-27",
    modelProgrammaticSpend: true,
  })
  const line = linesById(snap).get("sinch001pd1")
  assert.equal(line?.impressions, 100_000)
  assert.equal(line?.spendToDate, 0)
  assert.equal(getCampaignPacingData.mock.calls.length, 2)
  const history = getCampaignPacingData.mock.calls[1]?.arguments[2] as { startDate: string; endDate: string }
  assert.deepEqual(history, { startDate: "2026-07-15", endDate: "2026-10-27" })
})

test("modelled spend off (default): CM360 lines keep $0, as for AVA and delivered totals", { skip }, async () => {
  const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
  factRows = [row("sinch001pd1", "2026-10-01", 100_000)]
  const snap = await loadDeliverySnapshot({
    mbaNumber: "sinch001",
    versionNumber: 1,
    lineItemsByChannel: { progDisplay: sinchLines.progDisplay },
    feePctsByVersionId: {},
  })
  const line = linesById(snap).get("sinch001pd1")
  assert.equal(line?.spendToDate, 0)
  assert.equal(line?.spendMode, undefined)
  assert.equal(snap.includesEstimatedSpend, undefined)
})

test("fixed-cost and DSP programmatic lines are never modelled", { skip }, async () => {
  const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
  factRows = [
    { ...row("sinch001pd9", "2026-10-01", 100_000), channel: "programmatic-display", amountSpent: 321 },
  ]
  const snap = await loadDeliverySnapshot({
    mbaNumber: "sinch001",
    versionNumber: 1,
    lineItemsByChannel: {
      progDisplay: [
        {
          line_item_id: "sinch001pd9",
          name: "DV360",
          platform: "DV360",
          buy_type: "cpm",
          bursts: sinchLines.progDisplay[0]!.bursts,
        },
      ],
    },
    feePctsByVersionId: {},
    modelProgrammaticSpend: true,
  })
  const line = linesById(snap).get("sinch001pd9")
  assert.equal(line?.spendToDate, 321)
  assert.equal(line?.spendMode, "actual")
})
