import assert from "node:assert/strict"
import test from "node:test"

import {
  channelRows,
  deriveChannelTabs,
  type ChannelTab,
} from "../channelTabs.js"

function item(
  overrides: Record<string, unknown> & { line_item_id?: string },
): Record<string, unknown> {
  return { ...overrides }
}

function tabKeys(tabs: ChannelTab[]): string[] {
  return tabs.map((t) => t.channelKey)
}

test("deriveChannelTabs: fixed digital → prog → search → social order, only active channels", () => {
  const tabs = deriveChannelTabs({
    socialMedia: [item({ line_item_id: "s1", publisher: "Meta" })],
    progDisplay: [item({ line_item_id: "p1", publisher: "DV360" })],
    search: [item({ line_item_id: "se1", publisher: "Google" })],
    digitalDisplay: [item({ line_item_id: "d1", publisher: "Nine" })],
    digitalAudio: [],
  })

  assert.deepEqual(tabKeys(tabs), [
    "digitalDisplay",
    "progDisplay",
    "search",
    "socialMedia",
  ])
  assert.equal(tabs[0].family, "cm360")
  assert.equal(tabs[0].label, "Digital Display")
  assert.equal(tabs[0].containerKey, "digidisplay")
  assert.equal(tabs[1].family, "dv360")
  assert.equal(tabs[2].family, "search")
  assert.equal(tabs[3].family, "meta")
  assert.equal(tabs[3].containerKey, "socialmedia")
})

test("deriveChannelTabs: appends YouTube then Native when matching rows exist", () => {
  const tabs = deriveChannelTabs({
    digitalVideo: [
      item({ line_item_id: "dv1", publisher: "YouTube" }),
      item({ line_item_id: "dv2", publisher: "Nine" }),
    ],
    progVideo: [item({ line_item_id: "pv1", publisher: "DV360" })],
    digitalDisplay: [
      item({ line_item_id: "dd1", publisher: "Taboola" }),
      item({ line_item_id: "dd2", publisher: "Nine" }),
    ],
    search: [item({ line_item_id: "se1", publisher: "Google" })],
  })

  assert.deepEqual(tabKeys(tabs), [
    "digitalDisplay",
    "digitalVideo",
    "progVideo",
    "search",
    "youtube",
    "native",
  ])
  const yt = tabs.find((t) => t.channelKey === "youtube")!
  assert.equal(yt.family, "youtube")
  assert.equal(yt.label, "YouTube")
  const native = tabs.find((t) => t.channelKey === "native")!
  assert.equal(native.family, "native")
  assert.equal(native.label, "Native")
})

test("deriveChannelTabs: no YouTube tab when video channels lack youtube-looking rows", () => {
  const tabs = deriveChannelTabs({
    digitalVideo: [item({ line_item_id: "dv1", publisher: "Nine" })],
    progVideo: [item({ line_item_id: "pv1", publisher: "DV360" })],
  })
  assert.ok(!tabKeys(tabs).includes("youtube"))
})

test("channelRows: standard tab excludes YouTube/Native rows (no duplicates)", () => {
  const lineItems = {
    digitalVideo: [
      item({ line_item_id: "yt1", publisher: "YouTube", targeting: "A25-54" }),
      item({
        line_item_id: "dv1",
        publisher: "Nine",
        targetingAttribute: "In-stream",
        market: "National",
        creative: "Hero_15s",
        size: "1920x1080",
        buyType: "CPM",
      }),
      item({ line_item_id: "nat1", publisher: "Taboola", targeting: "Affinity" }),
    ],
  }
  const tabs = deriveChannelTabs(lineItems)
  const digitalVideo = tabs.find((t) => t.channelKey === "digitalVideo")!
  const { rows, skipped } = channelRows(digitalVideo, lineItems)

  assert.deepEqual(
    rows.map((r) => r.line_item_id),
    ["dv1"],
  )
  assert.equal(rows[0].family, "cm360")
  assert.equal(rows[0].tab_label, "Digital Video")
  assert.equal(rows[0].publisher, "Nine")
  assert.equal(rows[0].media_type, "video")
  assert.equal(rows[0].buy_type, "CPM")
  assert.equal(rows[0].targeting_raw, "In-stream")
  assert.equal(rows[0].targeting_token, "instream")
  assert.equal(rows[0].geo_raw, "National")
  assert.equal(rows[0].geo_token, "national")
  assert.equal(rows[0].creative_name, "Hero_15s")
  assert.equal(rows[0].size, "1920x1080")
  assert.equal(skipped.count, 0)
})

test("channelRows: YouTube and Native tabs collect only their rows", () => {
  const lineItems = {
    digitalVideo: [
      item({ line_item_id: "yt1", publisher: "YouTube" }),
      item({ line_item_id: "dv1", publisher: "Nine" }),
    ],
    progVideo: [item({ line_item_id: "yt2", platform: "yt " })],
    digitalDisplay: [item({ line_item_id: "nat1", publisher: "Outbrain" })],
    search: [
      item({ line_item_id: "nat2", network: "native" }),
      item({ line_item_id: "se1", publisher: "Google" }),
    ],
  }
  const tabs = deriveChannelTabs(lineItems)
  const yt = tabs.find((t) => t.channelKey === "youtube")!
  const native = tabs.find((t) => t.channelKey === "native")!

  const ytResult = channelRows(yt, lineItems)
  assert.deepEqual(
    ytResult.rows.map((r) => r.line_item_id).sort(),
    ["yt1", "yt2"],
  )
  assert.ok(ytResult.rows.every((r) => r.family === "youtube"))
  assert.ok(ytResult.rows.every((r) => r.tab_label === "YouTube"))

  const nativeResult = channelRows(native, lineItems)
  assert.deepEqual(
    nativeResult.rows.map((r) => r.line_item_id).sort(),
    ["nat1", "nat2"],
  )
  assert.ok(nativeResult.rows.every((r) => r.family === "native"))
})

test("channelRows: tokenOverrides re-slugify targeting/geo (no raw dashes)", () => {
  const lineItems = {
    search: [
      item({
        line_item_id: "se1",
        publisher: "Google",
        targeting: "Brand Exact",
        market: "NSW",
      }),
    ],
  }
  const tabs = deriveChannelTabs(lineItems)
  const search = tabs[0]
  const { rows } = channelRows(search, lineItems, {
    se1: { targeting: "Brand-Exact!!", geo: "New South Wales" },
  })

  assert.equal(rows[0].targeting_raw, "Brand Exact")
  assert.equal(rows[0].targeting_token, "brandexact")
  assert.equal(rows[0].geo_raw, "NSW")
  assert.equal(rows[0].geo_token, "new_south_wales")
})

test("channelRows: missing line_item_id skipped with reason + count (not silent)", () => {
  const lineItems = {
    digitalDisplay: [
      item({ publisher: "Nine", targeting: "A" }),
      item({ line_item_id: "dd1", publisher: "Seven" }),
      item({ id: "", publisher: "SBS" }),
    ],
  }
  const tabs = deriveChannelTabs(lineItems)
  const { rows, skipped } = channelRows(tabs[0], lineItems)

  assert.deepEqual(
    rows.map((r) => r.line_item_id),
    ["dd1"],
  )
  assert.equal(skipped.reason, "missing_line_item_id")
  assert.equal(skipped.count, 2)
})

test("channelRows: absent size/geo/creative resolve to empty tokens", () => {
  const lineItems = {
    progDisplay: [item({ line_item_id: "p1", publisher: "DV360" })],
  }
  const tabs = deriveChannelTabs(lineItems)
  const { rows } = channelRows(tabs[0], lineItems)
  assert.equal(rows[0].geo_raw, "")
  assert.equal(rows[0].geo_token, "")
  assert.equal(rows[0].creative_name, "")
  assert.equal(rows[0].size, "")
  assert.equal(rows[0].targeting_raw, "")
  assert.equal(rows[0].targeting_token, "")
})
