import assert from "node:assert/strict"
import { test } from "node:test"

import type { CreativePerformanceRow } from "../metrics"
import {
  adSetGroupKey,
  creativeFacts,
  creativesByAdSet,
  creativeSubtitle,
  creativesForLine,
  formatCreativeCtr,
  lineCreativeSlice,
  lineRankingMetric,
  platformWindowNote,
  selectTopCreatives,
  showAllCreativeLabel,
  topCreativeMetricLine,
} from "../present"

function row(partial: Partial<CreativePerformanceRow> & Pick<CreativePerformanceRow, "creativeKey" | "impressions">): CreativePerformanceRow {
  const clicks = partial.clicks ?? Math.round((partial.ctr ?? 0.01) * partial.impressions)
  return {
    platform: "meta",
    name: partial.creativeKey,
    lineItemId: "GOLF025SM1",
    lineLabel: "Meta • Players",
    format: { kind: "image", aspect: null },
    spend: 810,
    clicks,
    ctr: partial.impressions > 0 ? clicks / partial.impressions : null,
    cpm: 4,
    viewableRate: null,
    vcr: null,
    conversions: null,
    firstDate: "2026-09-01",
    lastDate: "2026-09-14",
    sizes: [],
    adSetId: null,
    adSetName: null,
    videoViews: null,
    videoCompletions: null,
    previewUrl: null,
    previewKind: null,
    viewUrl: null,
    videoUrl: null,
    rank: null,
    ...partial,
  }
}

test("top 3 picks a different reason for each ad and keeps the golf CTR leader", () => {
  const players = row({
    creativeKey: "players",
    name: "Image · Players to date",
    impressions: 202247,
    clicks: 3302,
    ctr: 3302 / 202247,
  })
  const fairway = row({
    creativeKey: "fairway",
    name: "Image · Fairway",
    impressions: 80000,
    clicks: 400,
    ctr: 400 / 80000,
  })
  const reel = row({
    creativeKey: "reel",
    name: "Video 9:16",
    impressions: 50000,
    clicks: 200,
    format: { kind: "video", aspect: "9:16" },
    vcr: 0.8,
  })
  const tiny = row({
    creativeKey: "tiny",
    name: "Image · Tiny",
    impressions: 9999,
    clicks: 900,
    ctr: 900 / 9999,
  })

  const picks = selectTopCreatives([fairway, tiny, reel, players])
  assert.deepEqual(
    picks.map((pick) => pick.reason),
    ["Best CTR", "Most reach", "Best completion"],
  )
  assert.deepEqual(
    picks.map((pick) => pick.creative.creativeKey),
    ["players", "fairway", "reel"],
  )
  assert.equal(new Set(picks.map((pick) => pick.creative.creativeKey)).size, 3)
  assert.equal(formatCreativeCtr(players.ctr), "1.63% CTR")
  assert.equal(topCreativeMetricLine(picks[0]!).headline, "1.63% CTR")
  assert.equal(picks.some((pick) => pick.creative.creativeKey === "tiny"), false)
})

test("a slot with no candidate falls back to the next impressions ad as Most reach", () => {
  const ads = [
    row({ creativeKey: "a", impressions: 30000, clicks: 900, ctr: 0.03 }),
    row({ creativeKey: "b", impressions: 20000, clicks: 200, ctr: 0.01 }),
    row({ creativeKey: "c", impressions: 12000, clicks: 60, ctr: 0.005, format: { kind: "image", aspect: null }, vcr: 0.9 }),
  ]
  const picks = selectTopCreatives(ads)
  assert.deepEqual(
    picks.map((pick) => [pick.reason, pick.creative.creativeKey]),
    [
      ["Best CTR", "a"],
      ["Most reach", "b"],
      ["Most reach", "c"],
    ],
  )
})

test("one ad that leads every measure is shown once", () => {
  const only = row({
    creativeKey: "only",
    impressions: 40000,
    clicks: 800,
    format: { kind: "video", aspect: "9:16" },
    vcr: 0.5,
  })
  const picks = selectTopCreatives([only])
  assert.equal(picks.length, 1)
  assert.equal(picks[0]?.reason, "Best CTR")
  assert.equal(picks[0]?.creative.creativeKey, "only")
})

test("creatives under 10,000 impressions do not take Best CTR or Best completion", () => {
  const loud = row({ creativeKey: "loud", impressions: 5000, clicks: 500, ctr: 0.1 })
  const video = row({
    creativeKey: "clip",
    impressions: 8000,
    clicks: 40,
    format: { kind: "video", aspect: "9:16" },
    vcr: 0.95,
  })
  const picks = selectTopCreatives([loud, video])
  assert.deepEqual(
    picks.map((pick) => pick.reason),
    ["Most reach", "Most reach"],
  )
  assert.deepEqual(
    picks.map((pick) => pick.creative.creativeKey),
    ["clip", "loud"],
  )
})

test("line grouping is case-insensitive, ranked by CTR, and show-all keeps the rest", () => {
  const rows = Array.from({ length: 7 }, (_, index) =>
    row({
      creativeKey: `ad-${index + 1}`,
      name: `Ad ${index + 1}`,
      lineItemId: index === 0 ? "golf025sm1" : "GOLF025SM1",
      impressions: 20000 - index * 100,
      clicks: 100 + index * 50,
      ctr: (100 + index * 50) / (20000 - index * 100),
    }),
  )
  rows.push(
    row({
      creativeKey: "other-line",
      lineItemId: "GOLF025SM2",
      impressions: 90000,
      clicks: 9000,
      ctr: 0.1,
    }),
  )
  rows.push(
    row({
      creativeKey: "video-low-ctr",
      name: "Video reel",
      impressions: 15000,
      clicks: 10,
      ctr: 10 / 15000,
      format: { kind: "video", aspect: "9:16" },
      vcr: 0.9,
    }),
  )

  const line = creativesForLine(rows, "GOLF025sm1")
  assert.equal(line.some((item) => item.creativeKey === "other-line"), false)
  assert.equal(line[0]?.creativeKey, "ad-7")
  assert.equal(line.at(-1)?.creativeKey, "video-low-ctr")
  assert.equal(lineRankingMetric(line.find((item) => item.creativeKey === "video-low-ctr")!), "90% completion")
  assert.equal(lineCreativeSlice(line, false).length, 6)
  assert.equal(lineCreativeSlice(line, true).length, line.length)
  assert.equal(showAllCreativeLabel(line.length, false), `Show all ${line.length}`)
  assert.equal(showAllCreativeLabel(line.length, true), null)
  assert.match(platformWindowNote(rows), /^Meta .+ to .+/)
})

test("the subtitle shows the platform once", () => {
  const label = "Meta • Avid Golfers — Handicap custom audiences …"
  assert.equal(
    creativeSubtitle({ platform: "meta", lineLabel: label }),
    "Meta · Avid Golfers — Handicap custom audiences …",
  )
  assert.equal(creativeSubtitle({ platform: "tiktok", lineLabel: "TikTok • Spark — AU" }), "TikTok · Spark — AU")
  assert.equal(creativeSubtitle({ platform: "meta", lineLabel: "Players" }), "Meta · Players")
  assert.equal(creativeSubtitle({ platform: "meta", lineLabel: null }), "Meta")
  for (const subtitle of [creativeSubtitle({ platform: "meta", lineLabel: label })]) {
    assert.equal(subtitle.match(/Meta/g)?.length, 1)
  }
})

test("panel facts show video views and completions only when present", () => {
  const image = row({ creativeKey: "img", impressions: 10000, clicks: 100, spend: 250 })
  assert.deepEqual(
    creativeFacts(image).map((fact) => fact.label),
    ["Spend", "Impressions", "Clicks", "CTR", "CPC"],
  )
  const facts = Object.fromEntries(creativeFacts(image).map((fact) => [fact.label, fact.value]))
  assert.equal(facts.Spend, "$250.00")
  assert.equal(facts.Impressions, "10,000")
  assert.equal(facts.CTR, "1.00%")
  assert.equal(facts.CPC, "$2.50")

  const video = row({ creativeKey: "vid", impressions: 10000, clicks: 0, spend: null, videoViews: 4000, videoCompletions: 1500 })
  const videoFacts = Object.fromEntries(creativeFacts(video).map((fact) => [fact.label, fact.value]))
  assert.equal(videoFacts.Spend, "—")
  assert.equal(videoFacts.CPC, "—")
  assert.equal(videoFacts["Video views"], "4,000")
  assert.equal(videoFacts["Video completions"], "1,500")
})

test("ad set expansion matches on id, else name, sorts by spend, and adds the unattributed gap", () => {
  const adSets = [
    { id: "238001", name: "Avid Golfers", spend: 100.05, impressions: 12000, clicks: 130 },
    { id: "238002", name: "Lapsed members", spend: 50, impressions: 5000, clicks: 50 },
    { id: "238003", name: "No creatives", spend: 9, impressions: 90, clicks: 1 },
  ]
  const creatives = [
    row({ creativeKey: "small", impressions: 2000, clicks: 30, spend: 20.02, adSetId: "238001" }),
    row({ creativeKey: "big", impressions: 9000, clicks: 90, spend: 70.01, adSetId: "238001" }),
    row({ creativeKey: "by-name", impressions: 5000, clicks: 50, spend: 50, adSetId: null, adSetName: " lapsed MEMBERS " }),
    row({ creativeKey: "elsewhere", impressions: 1, clicks: 0, spend: 1, adSetId: "999", adSetName: "Other set" }),
  ]
  const groups = creativesByAdSet(adSets, creatives)

  const golfers = groups.get(adSetGroupKey(adSets[0]!))!
  assert.deepEqual(golfers.creatives.map((c) => c.creativeKey), ["big", "small"])
  assert.deepEqual(golfers.unattributed, { spend: 10.02, impressions: 1000, clicks: 10 })

  const lapsed = groups.get(adSetGroupKey(adSets[1]!))!
  assert.deepEqual(lapsed.creatives.map((c) => c.creativeKey), ["by-name"])
  assert.equal(lapsed.unattributed, null)

  assert.deepEqual(groups.get(adSetGroupKey(adSets[2]!)), { creatives: [], unattributed: null })
})

test("float noise under a cent is not an unattributed row", () => {
  const groups = creativesByAdSet(
    [{ id: "a", name: "Set", spend: 0.3, impressions: 3, clicks: 0 }],
    [
      row({ creativeKey: "x", impressions: 1, clicks: 0, spend: 0.1, adSetId: "A" }),
      row({ creativeKey: "y", impressions: 2, clicks: 0, spend: 0.2, adSetId: "a" }),
    ],
  )
  assert.equal(groups.get("a")?.unattributed, null)
  assert.equal(groups.get("a")?.creatives.length, 2)
})
