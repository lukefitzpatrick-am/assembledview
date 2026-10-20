import assert from "node:assert/strict"
import { test } from "node:test"

import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import { selectDeckCreatives, uniqueDeckCreatives, withImageFiles } from "@/lib/reports/deckCreative/select"
import { formatDeckCreatives } from "@/scripts/spikes/report-deck-skill/slim-deck-payload"

function row(key: string, partial: Partial<CreativePerformanceRow> = {}): CreativePerformanceRow {
  return {
    platform: "meta",
    creativeKey: key,
    name: `Ad ${key}`,
    sizes: [],
    lineItemId: "golf025sm1",
    lineLabel: "Meta • Avid Golfers",
    adSetId: "1",
    adSetName: "Avid Golfers",
    format: { kind: "image", aspect: "1:1" },
    spend: 10,
    impressions: 1000,
    clicks: 10,
    ctr: 0.01,
    cpm: 10,
    viewableRate: null,
    vcr: null,
    videoViews: null,
    videoCompletions: null,
    conversions: null,
    firstDate: "2026-09-01",
    lastDate: "2026-09-30",
    previewUrl: null,
    previewKind: "image",
    viewUrl: null,
    videoUrl: null,
    rank: null,
    ...partial,
  }
}

test("campaign shows the top 3 by spend, then impressions; zero-impression creatives are dropped", () => {
  const out = selectDeckCreatives([
    row("a", { spend: 5 }),
    row("b", { spend: 50 }),
    row("c", { spend: null, impressions: 9000, platform: "cm360" }),
    row("d", { spend: 20 }),
    row("e", { spend: 99, impressions: 0 }),
  ])
  assert.deepEqual(out.campaign.map((r) => r.creativeKey), ["b", "d", "a"])
  assert.equal(out.campaign[0]?.platform, "Meta")
})

test("lines are grouped, ranked by spend, capped at 3 creatives each", () => {
  const out = selectDeckCreatives([
    row("a", { lineItemId: "L1", spend: 1 }),
    row("b", { lineItemId: "l1", spend: 2 }),
    row("c", { lineItemId: "l1", spend: 3 }),
    row("d", { lineItemId: "l1", spend: 4 }),
    row("e", { lineItemId: "l2", spend: 100, lineLabel: "TikTok • Juniors" }),
    row("f", { lineItemId: null, spend: 500 }),
  ])
  assert.deepEqual(out.lines.map((l) => l.lineItemId), ["l2", "l1"])
  assert.deepEqual(out.lines[1]?.rows.map((r) => r.creativeKey), ["d", "c", "b"])
  assert.equal(out.lines[0]?.label, "TikTok • Juniors")
})

test("view link prefers the Meta link, then the CM360 video file; image files attach by key", () => {
  const out = selectDeckCreatives([
    row("a", { viewUrl: "https://fb.me/x" }),
    row("v", { platform: "cm360", previewKind: "video", videoUrl: "https://gcdn.2mdn.net/videoplayback/1" }),
  ])
  assert.equal(out.campaign.find((r) => r.creativeKey === "a")?.viewUrl, "https://fb.me/x")
  assert.equal(out.campaign.find((r) => r.creativeKey === "v")?.viewUrl, "https://gcdn.2mdn.net/videoplayback/1")
  const unique = uniqueDeckCreatives(out)
  assert.equal(unique.length, 2)
  const withFiles = withImageFiles(out, new Map([["meta|a", "creative-1.jpg"]]))
  assert.equal(withFiles.campaign.find((r) => r.creativeKey === "a")?.imageFile, "creative-1.jpg")
  assert.equal(withFiles.lines[0]?.rows.find((r) => r.creativeKey === "a")?.imageFile, "creative-1.jpg")
  assert.equal(withFiles.campaign.find((r) => r.creativeKey === "v")?.imageFile, null)
})

test("slim payload formats creative figures as strings and drops empty creatives", () => {
  const out = selectDeckCreatives([row("a", { spend: 1512.333, impressions: 202247, clicks: 3297, ctr: 0.0163 })])
  const slim = formatDeckCreatives(out)
  const first = (slim?.campaign as { rows: Record<string, unknown>[] }).rows[0]
  assert.equal(first?.spend, "$1,512.33")
  assert.equal(first?.impressions, "202,247")
  assert.equal(first?.ctr, "1.63%")
  assert.equal(formatDeckCreatives({ campaign: [], lines: [] }), null)
  const cm = formatDeckCreatives(selectDeckCreatives([row("c", { spend: null, platform: "cm360" })]))
  assert.equal("spend" in ((cm?.campaign as { rows: Record<string, unknown>[] }).rows[0] ?? {}), false)
})
