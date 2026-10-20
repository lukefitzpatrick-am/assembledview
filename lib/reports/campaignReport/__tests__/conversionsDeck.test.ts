import assert from "node:assert/strict"
import test from "node:test"
import JSZip from "jszip"

import {
  buildCampaignReportDeck,
  deckConversionFigures,
} from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import { formatReportMoney } from "@/lib/reports/campaignReport/formatters"
import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import type { ConversionFigures } from "@/lib/delivery/conversions/channelConversions"
import { campaignReportFixture } from "../../../../scripts/smoke-campaign-report-fixture"

async function slideXml(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf)
  const parts = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  return Promise.all(parts.map((name) => zip.file(name)!.async("string")))
}

function fig(over: Partial<ConversionFigures>): ConversionFigures {
  return {
    label: "Purchases",
    count: 1234,
    conversions: 1300,
    purchases: 1234,
    leads: 66,
    revenue: 45678,
    spend: 10875,
    cpa: 8.81,
    roas: 4.2,
    tracked: true,
    valueTracked: true,
    ...over,
  }
}

function withConversions(): CampaignReportPayload {
  const [social, search, ...rest] = campaignReportFixture.channels
  return {
    ...campaignReportFixture,
    conversions: { headline: "purchases", label: "Purchases", showRevenue: true, throughDate: "2026-10-20" },
    totals: { ...campaignReportFixture.totals, conversions: fig({}) },
    channels: [
      { ...social!, conversions: fig({ count: 1000, revenue: 45678, roas: 4.2 }) },
      { ...search!, conversions: fig({ count: 234, revenue: null, roas: null, valueTracked: false }) },
      ...rest,
    ],
  }
}

test("deck figures: empty when the switch is off", () => {
  assert.deepEqual(deckConversionFigures({ conversions: null }, fig({})), [])
  assert.deepEqual(deckConversionFigures({ conversions: undefined }, fig({})), [])
})

test("deck figures: headline only when show revenue is off; Not tracked when no event", () => {
  const settings = { headline: "leads" as const, label: "Leads", showRevenue: false, throughDate: "2026-10-20" }
  assert.deepEqual(deckConversionFigures({ conversions: settings }, fig({ count: 12 })), [
    { label: "Leads", value: "12" },
  ])
  assert.deepEqual(deckConversionFigures({ conversions: settings }, fig({ count: null, tracked: false })), [
    { label: "Leads", value: "Not tracked" },
  ])
})

test("switch on: summary shows Purchases, Revenue and ROAS; channel tables swap Results for them", async () => {
  const slides = await slideXml(await buildCampaignReportDeck(withConversions()))
  const summary = slides.find((xml) => xml.includes("Key metrics."))
  assert.ok(summary)
  assert.match(summary, /Purchases/)
  assert.match(summary, /1,234/)
  assert.match(summary, /ROAS/)
  assert.match(summary, /4\.20x/)
  assert.ok(summary.includes(formatReportMoney(45678)))

  const social = slides.find((xml) => xml.includes("Social (Meta) data."))
  assert.ok(social)
  assert.match(social, /Purchases/)
  assert.match(social, /4\.20x/)
  assert.doesNotMatch(social, />Results</)

  const search = slides.find((xml) => xml.includes("Search data."))
  assert.ok(search)
  assert.match(search, />234</)
  assert.match(search, /Not tracked/, "search revenue not tracked")
})

test("switch off: deck unchanged (Results row, no ROAS)", async () => {
  const slides = await slideXml(await buildCampaignReportDeck(campaignReportFixture))
  const social = slides.find((xml) => xml.includes("Social (Meta) data."))
  assert.ok(social)
  assert.match(social, />Results</)
  const summary = slides.find((xml) => xml.includes("Key metrics."))
  assert.ok(summary)
  assert.doesNotMatch(summary, /ROAS/)
})
