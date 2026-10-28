/**
 * assembleCampaignReportData with a stubbed snapshot (28 Oct 2026 decisions):
 * - REP-1: the report asks for modelled CM360 programmatic spend, and a
 *   channel with that spend is live.
 * - REP-4: the KPI table's VTR reads completed views on video lines.
 * - REP-5: click trackers are out of planned impressions and are labelled.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

function line(partial: Partial<DeliveryLineSnapshot> & Pick<DeliveryLineSnapshot, "lineItemId">): DeliveryLineSnapshot {
  return {
    name: partial.lineItemId,
    plannedBudget: 1000,
    plannedUnits: null,
    startDate: "2026-10-01",
    endDate: "2026-11-30",
    spendToDate: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    cpm: null,
    ctr: null,
    cpc: null,
    expectedNetToDate: 500,
    noDeliveryRows: false,
    deliveryState: "reported",
    ...partial,
  }
}

function group(name: string, lines: DeliveryLineSnapshot[]): DeliveryChannelGroup {
  const sum = (pick: (l: DeliveryLineSnapshot) => number) => lines.reduce((s, l) => s + pick(l), 0)
  return {
    group: name,
    lines,
    totals: {
      spendToDate: sum((l) => l.spendToDate),
      impressions: sum((l) => l.impressions),
      clicks: sum((l) => l.clicks),
      results: sum((l) => l.results),
      video3sViews: sum((l) => l.video3sViews),
      plannedBudget: sum((l) => l.plannedBudget ?? 0),
      cpm: null,
      ctr: null,
      cpc: null,
    },
  } as DeliveryChannelGroup
}

const channels: DeliveryChannelGroup[] = [
  group("programmatic_video", [
    line({
      lineItemId: "sinch001pv1",
      spendToDate: 550,
      spendMode: "estimated",
      impressions: 10_000,
      video3sViews: 8_000,
      plannedImpressions: 363_636,
    }),
  ]),
  group("digital_display", [
    line({ lineItemId: "golf025dd1", clicks: 136, plannedImpressions: 138_462 }),
    line({ lineItemId: "golf025dd3", impressions: 262_025, clicks: 868, spendToDate: 4493.67, spendMode: "estimated", plannedImpressions: 580_000 }),
  ]),
]

const loadDeliverySnapshot = mock.fn(async (_input: Record<string, unknown>) => ({
  asOf: "2026-10-27",
  window: { startDate: "2026-10-01", endDate: "2026-10-27" },
  mbaNumber: "test001",
  versionNumber: 1,
  channels,
  planTotals: group("all", channels.flatMap((c) => c.lines)).totals,
  assumedExpectedLines: [],
  dailyPacingRows: [],
  dailySearch: null,
}))

if (supportsMockModule()) {
  await mock.module!("@/lib/delivery/loadDeliverySnapshot", { namedExports: { loadDeliverySnapshot } })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: { readPlanVersionsByMba: async () => [] },
  })
  await mock.module!("@/lib/kpi/campaignKpi", {
    namedExports: {
      fetchCampaignKpis: async () => [
        {
          mp_client_name: "Test",
          mba_number: "test001",
          version_number: 1,
          campaign_name: "Test",
          media_type: "progVideo",
          publisher: "quantcast - direct",
          bid_strategy: "cpm",
          line_item_id: "sinch001pv1",
          ctr: null,
          cpv: null,
          conversion_rate: null,
          vtr: 0.7,
          frequency: 3,
        },
      ],
    },
  })
}

test("deck rows: modelled spend is live, VTR from completions, click trackers labelled", { skip }, async () => {
  const { assembleCampaignReportData } = await import("../assembleCampaignReportData.js")
  const report = await assembleCampaignReportData({
    mbaNumber: "test001",
    versionNumber: 1,
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-11-30",
    periodKind: "campaign_to_date",
    todayISO: "2026-10-28",
    generateCommentary: async () => null,
    loadConversions: async () => null,
  })

  const snapInput = loadDeliverySnapshot.mock.calls[0]?.arguments[0] as Record<string, unknown>
  assert.equal(snapInput.modelProgrammaticSpend, true)

  const video = report.channels.find((c) => c.group === "programmatic_video")
  assert.equal(video?.notLive, false)
  assert.equal(video?.spendEstimated, true)

  const display = report.channels.find((c) => c.group === "digital_display")
  assert.equal(display?.clickTrackerLines, 1)
  assert.equal(display?.impressionsNote, "No impression tracking on 1 click-tracker line")
  // Planned impressions prorate DD3 only: 27 of 61 flight days.
  assert.ok(Math.abs((display?.plannedImpressions ?? 0) - (580_000 * 27) / 61) < 1e-6)
  // CPM reads only lines with impressions.
  assert.ok(Math.abs((display?.metrics.cpm ?? 0) - (4493.67 / 262_025) * 1000) < 1e-6)
  assert.equal(video?.clickTrackerLines, undefined)

  const vtr = report.kpis.find((k) => k.metric === "vtr")
  assert.equal(vtr?.actualDisplay, "80.00%")
  const frequency = report.kpis.find((k) => k.metric === "frequency")
  assert.equal(frequency?.actualDisplay, null)
})
