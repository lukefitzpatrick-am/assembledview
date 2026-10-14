import assert from "node:assert/strict"
import { test } from "node:test"

import {
  creativeRowsFromWarehouse,
  formatHint,
  groupAndRank,
  type CreativeDailyRow,
} from "../metrics"

function day(partial: Partial<CreativeDailyRow> & Pick<CreativeDailyRow, "creativeKey" | "date" | "impressions" | "clicks">): CreativeDailyRow {
  return {
    platform: "meta",
    creativeName: null,
    creativeSize: null,
    lineItemId: null,
    spend: null,
    viewableImpressions: null,
    videoViews: null,
    videoCompletions: null,
    conversions: null,
    ...partial,
  }
}

test("golf025 Meta image groups to 202,247 / 3,302 and ranks first on CTR", () => {
  const daily = [
    day({
      creativeKey: "players",
      creativeName: "Image · Players to date",
      lineItemId: "GOLF025SM1",
      date: "2026-09-01",
      spend: 400,
      impressions: 100000,
      clicks: 1500,
    }),
    day({
      creativeKey: "players",
      creativeName: "Image · Players to date",
      lineItemId: "GOLF025SM1",
      date: "2026-09-02",
      spend: 410,
      impressions: 102247,
      clicks: 1802,
    }),
    day({
      creativeKey: "low-sample",
      creativeName: "Image · Tiny",
      date: "2026-09-02",
      impressions: 500,
      clicks: 50,
    }),
    day({
      creativeKey: "fairway",
      creativeName: "Image · Fairway",
      date: "2026-09-02",
      spend: null,
      impressions: 5000,
      clicks: 40,
    }),
  ]

  const labels = new Map([
    ["golf025sm1", { label: "Meta • Players", size: "1080x1080" }],
  ])
  const ranked = groupAndRank(daily, labels, "ctr")

  assert.equal(ranked[0]?.creativeKey, "players")
  assert.equal(ranked[0]?.platform, "meta")
  assert.equal(ranked[0]?.name, "Image · Players to date")
  assert.equal(ranked[0]?.impressions, 202247)
  assert.equal(ranked[0]?.clicks, 3302)
  assert.equal(ranked[0]?.spend, 810)
  assert.equal(Number((ranked[0]!.ctr! * 100).toFixed(2)), 1.63)
  assert.equal(ranked[0]?.rank, 1)
  assert.equal(ranked[0]?.lineLabel, "Meta • Players")
  assert.equal(ranked[0]?.format.kind, "image")
  assert.equal(ranked[0]?.format.aspect, "1:1")
  assert.equal(ranked[0]?.cpm, (810 / 202247) * 1000)
  assert.deepEqual(ranked[0]?.preview, { status: "none" })
  assert.equal(ranked[0]?.firstDate, "2026-09-01")
  assert.equal(ranked[0]?.lastDate, "2026-09-02")

  const fairway = ranked.find((row) => row.creativeKey === "fairway")
  assert.equal(fairway?.rank, 2)
  assert.equal(fairway?.cpm, null)

  const low = ranked.find((row) => row.creativeKey === "low-sample")
  assert.ok(low)
  assert.ok((low!.ctr ?? 0) > (ranked[0]!.ctr ?? 0))
  assert.equal(low?.rank, null)
  assert.equal(ranked.at(-1)?.creativeKey, "low-sample")
})

test("VCR rank skips creatives under 1,000 impressions", () => {
  const daily = [
    day({
      creativeKey: "hero",
      creativeName: "Video 9:16",
      date: "2026-09-01",
      impressions: 2000,
      clicks: 10,
      videoViews: 100,
      videoCompletions: 40,
    }),
    day({
      creativeKey: "tiny-video",
      creativeName: "Video reel",
      date: "2026-09-01",
      impressions: 800,
      clicks: 8,
      videoViews: 80,
      videoCompletions: 80,
    }),
    day({
      creativeKey: "static",
      creativeName: "Image static",
      date: "2026-09-01",
      impressions: 4000,
      clicks: 20,
    }),
  ]
  const ranked = groupAndRank(daily, new Map(), "vcr")
  assert.equal(ranked[0]?.creativeKey, "hero")
  assert.equal(ranked[0]?.rank, 1)
  assert.equal(ranked[0]?.vcr, 0.4)
  assert.equal(ranked[0]?.format.kind, "video")
  assert.equal(ranked[0]?.format.aspect, "9:16")
  assert.equal(ranked.find((row) => row.creativeKey === "tiny-video")?.rank, null)
  assert.equal(ranked.find((row) => row.creativeKey === "static")?.rank, null)
})

test("warehouse rows accept uppercase keys and null spend", () => {
  const daily = creativeRowsFromWarehouse([
    {
      PLATFORM: "Meta",
      CREATIVE_KEY: "ad-1",
      CREATIVE_NAME: "Carousel 4:5",
      LINE_ITEM_ID: "GOLF025SM2",
      DATE: "2026-08-01",
      SPEND: null,
      IMPRESSIONS: "1200",
      CLICKS: "12",
      VIEWABLE_IMPRESSIONS: null,
      VIDEO_VIEWS: null,
      VIDEO_COMPLETIONS: null,
      CONVERSIONS: null,
    },
  ])
  const ranked = groupAndRank(daily, new Map(), "impressions")
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0]?.platform, "meta")
  assert.equal(ranked[0]?.impressions, 1200)
  assert.equal(ranked[0]?.spend, null)
  assert.equal(ranked[0]?.cpm, null)
  assert.equal(ranked[0]?.format.kind, "carousel")
  assert.equal(ranked[0]?.format.aspect, "4:5")
  assert.equal(ranked[0]?.rank, 1)
})

test("format hint reads a pixel size when no ratio is written", () => {
  assert.deepEqual(formatHint("Story", "1080x1920"), { kind: null, aspect: "9:16" })
})

test("Vertical Video.mp4 across five CM360 sizes groups to one creative", () => {
  const sizes = ["1920x1080", "1080x1920", "1080x1080", "640x360", "300x250"]
  const daily = sizes.map((creativeSize) =>
    day({
      platform: "cm360",
      creativeKey: "vertical video.mp4",
      creativeName: "Vertical Video.mp4",
      creativeSize,
      lineItemId: "golf025dd3",
      date: "2026-09-01",
      impressions: 1000,
      clicks: 10,
      viewableImpressions: 640,
    }),
  )
  daily.push(
    day({
      platform: "cm360",
      creativeKey: "not-set:golf025dd3",
      creativeName: "(not set)",
      lineItemId: "golf025dd3",
      date: "2026-09-01",
      impressions: 50,
      clicks: 1,
    }),
  )

  const ranked = groupAndRank(daily, new Map(), "impressions")
  const video = ranked.find((row) => row.creativeKey === "vertical video.mp4")
  assert.equal(ranked.filter((row) => row.creativeKey === "vertical video.mp4").length, 1)
  assert.equal(video?.name, "Vertical Video.mp4")
  assert.equal(video?.impressions, 5000)
  assert.equal(video?.viewableRate, 0.64)
  assert.deepEqual(video?.sizes, ["1080x1080", "1080x1920", "1920x1080", "300x250", "640x360"])
  assert.equal(video?.format.kind, "video")
  assert.equal(ranked.find((row) => row.creativeKey === "not-set:golf025dd3")?.name, "(not set)")
})
