import assert from "node:assert/strict"
import test from "node:test"

import { cpc, cpm, cpv } from "@/lib/money/rates"
import { formatReportDate } from "@/lib/reports/campaignReport/formatters"
import { campaignReportDownloadName } from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import { resolveCampaignReportPeriod } from "@/lib/reports/campaignReport/periods"
import { formatReportMoney } from "@/lib/reports/campaignReport/formatters"
import {
  campaignReportChannelLabel,
  campaignReportPeriodFilePart,
  campaignSpendIncludingAssumed,
  campaignSpendShareSentence,
  deliveryLinesForRates,
  isBlankKpiTarget,
  planDeliverablesFromItem,
  prorateDeliverable,
  rateExclusionFootnote,
  rateMetricsFromLines,
  rewriteCampaignSpendShare,
} from "@/lib/reports/campaignReport/reportFigures"

test("campaign to date has no previous window", () => {
  const period = resolveCampaignReportPeriod({
    kind: "campaign_to_date",
    campaignStartISO: "2026-08-01",
    campaignEndISO: "2026-10-25",
    todayISO: "2026-10-10",
  })
  assert.equal(period.previous, null)
  assert.equal(period.current.startISO, "2026-08-01")
  assert.equal(period.current.endISO, "2026-10-10")
})

test("a custom range that starts on the flight has no previous window", () => {
  const onStart = resolveCampaignReportPeriod({
    kind: "custom",
    campaignStartISO: "2026-08-01",
    customStartISO: "2026-08-01",
    customEndISO: "2026-08-15",
  })
  assert.equal(onStart.previous, null)

  const afterStart = resolveCampaignReportPeriod({
    kind: "custom",
    campaignStartISO: "2026-06-01",
    customStartISO: "2026-08-01",
    customEndISO: "2026-08-15",
  })
  assert.equal(afterStart.previous?.endISO, "2026-07-31")
})

test("rates exclude spend with no impressions or clicks", () => {
  const { metrics, excludedSpend } = rateMetricsFromLines(
    [
      { spend: 61_644, impressions: 5_080_000, clicks: 4_070, views: 12_000 },
      { spend: 18_240, impressions: 0, clicks: 0, views: 0 },
    ],
    84_541,
  )
  assert.equal(excludedSpend, 18_240)
  assert.equal(metrics.cpm, cpm(61_644, 5_080_000))
  assert.equal(metrics.cpc, cpc(61_644, 4_070))
  assert.equal(metrics.cpv, cpv(61_644, 12_000))
  assert.equal(metrics.spendPacePct, (61_644 + 18_240) / 84_541)
})

test("the deck footnote includes assumed spend and leaves estimated rates alone", () => {
  const lines = deliveryLinesForRates([
    {
      deliveryState: "reported",
      spendToDate: 1_000,
      impressions: 100_000,
      clicks: 50,
      video3sViews: 0,
    },
    {
      deliveryState: "assumed",
      spendToDate: 200,
      impressions: 40_000,
      clicks: 10,
      video3sViews: 5,
    },
  ])
  const { metrics, excludedSpend } = rateMetricsFromLines(lines, 1_500)
  assert.equal(excludedSpend, 200)
  assert.equal(metrics.cpm, cpm(1_000, 100_000))
  assert.equal(metrics.cpc, cpc(1_000, 50))
  assert.equal(metrics.cpv, null)
  assert.equal(metrics.spendPacePct, (1_000 + 200) / 1_500)
  const footnote = rateExclusionFootnote(excludedSpend)
  assert.equal(
    footnote,
    `Rates exclude ${formatReportMoney(200)} of spend with no reported impressions or clicks.`,
  )
  assert.equal(campaignReportChannelLabel("assumed_spend"), "Assumed spend")
  assert.equal(campaignReportChannelLabel("bvod"), "BVOD")
  assert.equal(
    campaignSpendIncludingAssumed(1_000, [
      { group: "bvod", totals: { spendToDate: 1_000 } },
      { group: "assumed_spend", totals: { spendToDate: 200 } },
    ]),
    1_200,
  )
})

test("a channel share is worded as campaign spend", () => {
  assert.equal(
    campaignSpendShareSentence("Social (Meta)", 23),
    "Social (Meta) was 23% of campaign spend.",
  )
  assert.equal(
    rewriteCampaignSpendShare("Social (Meta) delivered 23% of spend."),
    "Social (Meta) was 23% of campaign spend.",
  )
})

test("planned deliverables come from the buy type and are prorated to a short window", () => {
  const social = planDeliverablesFromItem({
    buyType: "cpm",
    bursts: [{ startDate: "2026-08-01", endDate: "2026-10-25", calculatedValue: 8600 }],
  })
  assert.equal(social.impressions, 8600)
  assert.equal(social.clicks, null)

  const clicks = planDeliverablesFromItem({ buyType: "cpc", units: 400 })
  assert.equal(clicks.clicks, 400)

  assert.deepEqual(planDeliverablesFromItem({ buyType: "fixed_cost" }), {
    impressions: null,
    clicks: null,
    views: null,
  })

  const prorated = prorateDeliverable({
    total: 8600,
    lineStartISO: "2026-08-01",
    lineEndISO: "2026-10-25",
    flightStartISO: "2026-08-01",
    flightEndISO: "2026-10-25",
    periodStartISO: "2026-08-01",
    periodEndISO: "2026-10-10",
  })
  assert.equal(prorated, 7100)

  const wholeFlight = prorateDeliverable({
    total: 8600,
    lineStartISO: "2026-08-01",
    lineEndISO: "2026-10-25",
    flightStartISO: "2026-08-01",
    flightEndISO: "2026-10-25",
    periodStartISO: "2026-08-01",
    periodEndISO: "2026-10-25",
  })
  assert.equal(wholeFlight, 8600)
})

test("a zero or empty KPI target is hidden", () => {
  assert.equal(isBlankKpiTarget(0), true)
  assert.equal(isBlankKpiTarget("0"), true)
  assert.equal(isBlankKpiTarget(""), true)
  assert.equal(isBlankKpiTarget(null), true)
  assert.equal(isBlankKpiTarget(0.25), false)
})

test("deck dates use d MMM yyyy", () => {
  assert.equal(formatReportDate("2026-10-10"), "10 Oct 2026")
})

test("file name follows the period type", () => {
  assert.equal(
    campaignReportPeriodFilePart({
      kind: "campaign_to_date",
      startISO: "2026-08-01",
      endISO: "2026-10-10",
    }),
    "campaign-to-date-2026-10-10",
  )
  assert.equal(
    campaignReportPeriodFilePart({
      kind: "this_month",
      startISO: "2026-08-01",
      endISO: "2026-08-15",
    }),
    "2026-08",
  )
  assert.equal(
    campaignReportPeriodFilePart({
      kind: "custom",
      startISO: "2026-08-01",
      endISO: "2026-10-10",
    }),
    "2026-08-01-to-2026-10-10",
  )
  assert.equal(
    campaignReportDownloadName({
      clientName: "BIC",
      campaignName: "Unmatchable 2026",
      periodStartISO: "2026-08-01",
      periodEndISO: "2026-10-10",
      periodKind: "campaign_to_date",
    }),
    "BIC-Unmatchable-2026-report-campaign-to-date-2026-10-10.pptx",
  )
  assert.equal(
    campaignReportDownloadName({
      clientName: "BIC",
      campaignName: "Unmatchable 2026",
      periodStartISO: "2026-08-01",
      periodEndISO: "2026-08-31",
      periodKind: "this_month",
    }),
    "BIC-Unmatchable-2026-report-2026-08.pptx",
  )
  assert.equal(
    campaignReportDownloadName({
      clientName: "BIC",
      campaignName: "Unmatchable 2026",
      periodStartISO: "2026-08-01",
      periodEndISO: "2026-10-10",
      periodKind: "custom",
    }),
    "BIC-Unmatchable-2026-report-2026-08-01-to-2026-10-10.pptx",
  )
})
