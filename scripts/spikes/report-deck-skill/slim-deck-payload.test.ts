import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { assumedSpendDeckLabel } from "@/lib/reports/campaignReport/reportFigures"
import {
  formatDeckCount,
  formatDeckMoney,
  formatDeckPacePercent,
  formatDeckPercent,
  formatFrequencyTarget,
  slimDeckPayload,
} from "./slim-deck-payload"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function fixture(mba: string): Record<string, unknown> {
  const file = path.join(
    repoRoot,
    "docs/superpowers/overnight-av-fixes/discovery",
    `AV-TP10-${mba}-2026-09.json`,
  )
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>
}

test("hema007 and curatif004 slim payloads stay under 25 KB and keep the deck figures", () => {
  for (const mba of ["hema007", "curatif004"]) {
    const source = fixture(mba)
    const slim = slimDeckPayload(source)
    const bytes = Buffer.byteLength(JSON.stringify(slim))
    assert.ok(bytes < 25_000, `${mba} slim payload is ${bytes} bytes`)
    assert.equal(slim.mbaNumber, mba)
    assert.ok(slim.summary && typeof slim.summary === "object")
    assert.ok(Array.isArray(slim.channels) && slim.channels.length > 0)
    assert.ok(Array.isArray(slim.kpis) && slim.kpis.length > 0)
    assert.ok(Array.isArray(slim.notLive))
    assert.equal("weekly" in slim, false)
    assert.equal(JSON.stringify(slim).includes('"daily"'), false)
    const live = (slim.channels as { notLive?: boolean }[]).filter((channel) => channel.notLive === true)
    assert.equal((slim.notLive as unknown[]).length, live.length)
  }
  const hema = slimDeckPayload(fixture("hema007"))
  const summary = hema.summary as { spend: string; impressions: string }
  assert.equal(summary.spend, "$3,484.79")
  assert.equal(summary.impressions, "394,863")
  const summaryRecord = hema.summary as {
    timeElapsedPct: string
    metrics: { spendPacePct: string; ctr: string }
  }
  assert.equal(summaryRecord.timeElapsedPct, "74.80%")
  assert.equal(summaryRecord.metrics.ctr, "2.31%")
  assert.equal(summaryRecord.metrics.spendPacePct, "35%")
  const social = (hema.channels as { metrics: { spendPacePct: string; ctr: string } }[])[0]
  assert.equal(social.metrics.spendPacePct, "116%")
  assert.equal(social.metrics.ctr, "2.31%")
  const encoded = JSON.stringify(hema)
  assert.equal(encoded.includes("3484.7899999999995"), false)
  assert.equal(encoded.includes("394863"), false)
  const kpis = hema.kpis as { metric: string; targetDisplay: string; actualDisplay: string }[]
  const frequency = kpis.find((kpi) => kpi.metric === "frequency")
  assert.equal(frequency?.targetDisplay, "1.0 frequency")
  assert.equal(frequency?.actualDisplay, "Not yet reported")
})

test("deck figures format money, counts, percents and frequency targets", () => {
  assert.equal(formatDeckMoney(3484.7899999999995), "$3,484.79")
  assert.equal(formatDeckCount(394863), "394,863")
  assert.equal(formatDeckCount(801.623869), "802")
  assert.equal(formatDeckCount(183.62386899999998), "184")
  assert.equal(formatDeckPercent(0.02305103288988839), "2.31%")
  assert.equal(formatDeckPacePercent(0.3484789999999999), "35%")
  assert.equal(formatDeckPacePercent(1.1615966666666666), "116%")
  assert.equal(formatFrequencyTarget("1"), "1.0 frequency")
  assert.equal(formatFrequencyTarget("1.0 frequency"), "1.0 frequency")
})

test("results, conversions, clicks and impressions are whole numbers", () => {
  const slim = slimDeckPayload({
    mbaNumber: "curatif004",
    clientName: "Curatif",
    campaignName: "FY27",
    totals: {
      spend: 15927.56,
      impressions: 865926.4,
      clicks: 18669.2,
      results: 801.623869,
      conversions: 801.623869,
      metrics: { cpm: 18.391, cpc: 0.853, cpa: 19.876, ctr: 0.02305103288988839 },
    },
    channels: [],
    kpis: [],
  })
  const summary = slim.summary as {
    spend: string
    impressions: string
    clicks: string
    results: string
    conversions: string
    metrics: { cpm: string; cpc: string; cpa: string; ctr: string }
  }
  assert.equal(summary.results, "802")
  assert.equal(summary.conversions, "802")
  assert.equal(summary.impressions, "865,926")
  assert.equal(summary.clicks, "18,669")
  assert.equal(summary.spend, "$15,927.56")
  assert.equal(summary.metrics.cpm, "$18.39")
  assert.equal(summary.metrics.cpc, "$0.85")
  assert.equal(summary.metrics.cpa, "$19.88")
  assert.equal(summary.metrics.ctr, "2.31%")
})

function audienceReport(channels: Record<string, unknown>[]): Record<string, unknown> {
  return {
    mbaNumber: "krusty002",
    clientName: "Krusty",
    campaignName: "Deck",
    versionNumber: 1,
    asOf: "2026-12-20",
    period: { kind: "custom", label: "15 Nov – 20 Dec" },
    totals: { spend: 1000, impressions: 10000 },
    channels,
    kpis: [],
    commentary: null,
  }
}

function adSet(
  name: string,
  spend: number,
  impressions: number,
  results: number,
  clicks: number,
): Record<string, unknown> {
  return {
    entityName: name,
    spend,
    impressions,
    results,
    clicks,
    resultLabel: "Purchases",
    creativeUrl: "https://example.test/creative.jpg",
    ads: [{ id: "ad-1", name: "Ad one" }],
  }
}

test("five ad sets above 5% of channel spend become the top 4 formatted audiences", () => {
  const slim = slimDeckPayload(
    audienceReport([
      {
        group: "social_meta",
        label: "Social (Meta)",
        spend: 1000,
        adSets: [
          adSet("Alpha", 300, 10000, 40, 200),
          adSet("Bravo", 200, 8000, 20, 160),
          adSet("Charlie", 180, 6000, 18, 90),
          adSet("Delta", 170, 5000, 10, 50),
          adSet("Echo", 150, 4000, 15, 40),
        ],
      },
      {
        group: "social_tiktok",
        label: "Social (TikTok)",
        spend: 500,
        adSets: [adSet("Only group", 500, 1000, 10, 20)],
      },
      {
        group: "social_reddit",
        label: "Social (Reddit)",
        spend: 900,
        adSets: [
          adSet("Reddit one", 400, 1000, 10, 20),
          adSet("Reddit two", 300, 1000, 10, 20),
          adSet("Reddit three", 200, 1000, 10, 20),
        ],
      },
    ]),
  )
  const audiences = slim.audiences as {
    name: string
    spend: string
    impressions: string
    results: string
    resultLabel: string
    cpr: string
    ctr: string
  }[]
  assert.equal(audiences.length, 4)
  assert.deepEqual(
    audiences.map((row) => row.name),
    ["Alpha", "Bravo", "Charlie", "Delta"],
  )
  assert.equal(audiences.some((row) => row.name === "Echo"), false)
  assert.equal(audiences.some((row) => row.name === "Only group"), false)
  assert.equal(audiences.some((row) => row.name.startsWith("Reddit")), false)
  const alpha = audiences[0]!
  assert.equal(alpha.spend, "$300.00")
  assert.equal(alpha.impressions, "10,000")
  assert.equal(alpha.results, "40")
  assert.equal(alpha.resultLabel, "Purchases")
  assert.equal(alpha.cpr, "$7.50")
  assert.equal(alpha.ctr, "2.00%")
  assert.equal("creativeUrl" in alpha, false)
  assert.equal("ads" in alpha, false)
  const encoded = JSON.stringify(audiences)
  assert.equal(encoded.includes("example.test"), false)
  assert.equal(encoded.includes("ad-1"), false)
})

test("an ad set under 5% of channel spend is left out", () => {
  const slim = slimDeckPayload(
    audienceReport([
      {
        group: "social_meta",
        label: "Social (Meta)",
        spend: 1000,
        adSets: [
          adSet("Alpha", 600, 1000, 10, 20),
          adSet("Bravo", 360, 1000, 10, 20),
          adSet("Tiny", 40, 1000, 10, 20),
        ],
      },
    ]),
  )
  const audiences = slim.audiences as { name: string }[]
  assert.deepEqual(
    audiences.map((row) => row.name),
    ["Alpha", "Bravo"],
  )
})

test("a channel with one ad set has no audiences list", () => {
  const slim = slimDeckPayload(
    audienceReport([
      {
        group: "social_tiktok",
        label: "Social (TikTok)",
        spend: 500,
        adSets: [adSet("Only group", 500, 1000, 10, 20)],
      },
    ]),
  )
  assert.equal("audiences" in slim, false)
})

test("detail rows are formatted strings, and channel level has an empty detail", () => {
  const channel = slimDeckPayload({
    mbaNumber: "curatif004",
    clientName: "Curatif",
    campaignName: "FY27",
    totals: { spend: 10 },
    channels: [],
    kpis: [],
    detailLevel: "channel",
    detail: [],
  })
  assert.equal(channel.detailLevel, "channel")
  assert.deepEqual(channel.detail, [])

  const slim = slimDeckPayload({
    mbaNumber: "curatif004",
    clientName: "Curatif",
    campaignName: "FY27",
    totals: { spend: 10 },
    channels: [],
    kpis: [],
    detailLevel: "ad_group",
    detail: [
      {
        group: "social_meta",
        label: "Social (Meta)",
        level: "ad_group",
        rankBy: "spend",
        total: 1,
        note: null,
        rows: [{
          name: "Prospecting-AU-ADV+",
          spend: 24689.97,
          impressions: 1000,
          clicks: 50,
          results: null,
          ctr: 0.05,
        }],
      },
      {
        group: "digital_display",
        label: "Digital Display",
        level: "ad_group",
        rankBy: "impressions",
        total: 1,
        note: "Placements ranked by impressions. Spend is reported at line level.",
        rows: [{
          name: "NewsCorp-Video",
          spend: null,
          impressions: 249317,
          clicks: 40,
          results: null,
          ctr: 40 / 249317,
        }],
      },
    ],
  })
  const detail = slim.detail as Array<{ rows: Array<Record<string, string>> }>
  const meta = detail[0]?.rows[0]
  assert.equal(meta?.spend, "$24,689.97")
  assert.equal(meta?.impressions, "1,000")
  assert.equal(meta?.clicks, "50")
  assert.equal(meta?.results, "Not yet reported")
  assert.equal(meta?.ctr, "5.00%")
  const placement = detail[1]?.rows[0]
  assert.equal("spend" in (placement ?? {}), false)
  assert.equal(placement?.impressions, "249,317")
  assert.equal(placement?.results, "Not yet reported")
})

test("television and radio assumed-spend lines are named Television and Radio", () => {
  assert.equal(assumedSpendDeckLabel(["planTV1", "planRA1"]), "Television and Radio")
  const slim = slimDeckPayload({
    mbaNumber: "sample",
    clientName: "Sample",
    campaignName: "Sample",
    totals: { spend: 10 },
    channels: [
      {
        group: "assumed_spend",
        label: assumedSpendDeckLabel(["planTV1", "planRA1"]),
        spend: 10,
      },
    ],
    kpis: [],
  })
  const channels = slim.channels as Array<{ group: string; label: string }>
  assert.equal(channels[0]?.group, "assumed_spend")
  assert.equal(channels[0]?.label, "Television and Radio")
})

test("charts keep numeric points, weekly is gone, and the cap is 80,000", () => {
  const slim = slimDeckPayload({
    mbaNumber: "curatif004",
    clientName: "Curatif",
    campaignName: "FY27",
    totals: { spend: 18 },
    channels: [
      {
        group: "social_meta",
        label: "Social (Meta)",
        spend: 10,
        daily: [{ date: "2026-09-01", spend: 10, impressions: 100 }],
      },
    ],
    kpis: [],
    charts: [
      {
        scope: "campaign",
        group: null,
        label: "All channels",
        left: { key: "spend", label: "Spend", format: "money" },
        right: { key: "clicks", label: "Clicks", format: "count" },
        points: [
          ["2026-07-01", 12.5, 3],
          ["2026-07-02", 0, 1],
        ],
        note: null,
      },
    ],
  })
  assert.equal("weekly" in slim, false)
  assert.equal(JSON.stringify(slim).includes('"daily"'), false)
  const charts = slim.charts as { points: Array<[string, number, number | null]> }[]
  assert.equal(charts[0]?.points[0]?.[1], 12.5)
  assert.equal(typeof charts[0]?.points[0]?.[1], "number")
  assert.equal(typeof charts[0]?.points[0]?.[2], "number")

  const point = ["2026-07-01", 12345.67, 890] as [string, number, number]
  const sized = (count: number) =>
    slimDeckPayload({
      mbaNumber: "cap",
      clientName: "Cap",
      campaignName: "Cap",
      totals: { spend: 1 },
      channels: [],
      kpis: [],
      charts: [
        {
          scope: "campaign",
          group: null,
          label: "All channels",
          left: { key: "spend", label: "Spend", format: "money" },
          right: null,
          points: Array.from({ length: count }, () => point),
          note: null,
        },
      ],
    })
  const under = sized(1500)
  assert.ok(Buffer.byteLength(JSON.stringify(under)) <= 80_000)
  assert.throws(() => sized(5000), /80,?000/)
})
