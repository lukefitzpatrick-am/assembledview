import assert from "node:assert/strict"
import test from "node:test"
import JSZip from "jszip"

import { BRAND } from "@/lib/brand"
import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import {
  formatReportCtr,
  formatReportInt,
  formatReportPace,
  formatReportRate,
  REPORT_FIGURE_DASH,
} from "@/lib/reports/campaignReport/formatters"
import { campaignReportPeriodMetrics } from "@/lib/reports/campaignReport/periodMetrics"
import { campaignReportFixture } from "../../../../scripts/smoke-campaign-report-fixture"
import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function slideXml(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf)
  const parts = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  return Promise.all(parts.map((name) => zip.file(name)!.async("string")))
}

function periodSummarySlide(slides: string[]): string {
  const slide = slides.find((xml) => xml.includes("Key metrics."))
  assert.ok(slide, "period summary slide with Key metrics.")
  return slide
}

function payloadWithPace(paceSpend: number, expected: number): CampaignReportPayload {
  const metrics = campaignReportPeriodMetrics({
    spend: paceSpend,
    impressions: 0,
    clicks: 0,
    video3sViews: 0,
    expectedSpend: expected,
  })
  return {
    ...campaignReportFixture,
    channels: [
      {
        ...campaignReportFixture.channels[0]!,
        spend: paceSpend,
        impressions: 0,
        clicks: 0,
        metrics,
        previousMetrics: null,
      },
    ],
    totals: {
      ...campaignReportFixture.totals,
      spend: paceSpend,
      impressions: 0,
      clicks: 0,
      expectedSpendToDate: expected,
      metrics,
      previousMetrics: null,
    },
  }
}

test("period summary shows key metrics, video views, and a dash for a zero-impression CPM", async () => {
  const deck = await buildCampaignReportDeck(campaignReportFixture)
  const slides = await slideXml(deck)
  const text = periodSummarySlide(slides)
  const totals = campaignReportFixture.totals.metrics

  assert.match(text, /Key metrics\./)
  assert.match(text, new RegExp(escapeRegExp(formatReportRate(totals.cpm))))
  assert.match(text, new RegExp(escapeRegExp(formatReportCtr(totals.ctr))))
  assert.match(text, new RegExp(escapeRegExp(formatReportPace(totals.spendPacePct))))
  assert.match(text, new RegExp(escapeRegExp(formatReportInt(totals.videoViews3s ?? 0))))
  assert.match(text, /CPM/)
  assert.match(text, /Spend pace/)
  assert.match(text, /3-second views/)

  const social = slides.find((xml) => xml.includes("Social (Meta) data."))
  assert.ok(social, "social channel table")
  assert.match(social, new RegExp(escapeRegExp(formatReportRate(campaignReportFixture.channels[0]!.metrics.cpm))))
  assert.match(social, /3-second views/)
  const search = slides.find((xml) => xml.includes("Search data."))
  assert.ok(search, "search channel table")
  assert.match(search, /Spend pace/)
  assert.doesNotMatch(search, /3-second views/)
})

test("a zero-impression channel shows a dash, not $0.00, and pace uses the status tone", async () => {
  const behind = await buildCampaignReportDeck(payloadWithPace(200, 400))
  const behindText = periodSummarySlide(await slideXml(behind))
  assert.match(behindText, new RegExp(escapeRegExp(REPORT_FIGURE_DASH)))
  assert.doesNotMatch(behindText, /\$0\.00/)
  assert.match(behindText, /50\.0%/)
  assert.match(behindText, new RegExp(BRAND.functional.amber.replace("#", ""), "i"))
  assert.doesNotMatch(behindText, new RegExp(BRAND.functional.coral.replace("#", ""), "i"))

  const over = await buildCampaignReportDeck(payloadWithPace(500, 400))
  const overText = periodSummarySlide(await slideXml(over))
  assert.match(overText, /125\.0%/)
  assert.match(overText, new RegExp(BRAND.functional.coral.replace("#", ""), "i"))
  assert.doesNotMatch(overText, new RegExp(BRAND.functional.amber.replace("#", ""), "i"))
  assert.doesNotMatch(overText, /\$0\.00/)
})
