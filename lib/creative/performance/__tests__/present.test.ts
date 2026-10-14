import assert from "node:assert/strict"
import { test } from "node:test"

import type { CreativePerformanceRow } from "../metrics"
import {
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
    preview: { status: "none" },
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
