import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { groupAndRank, type CreativeDailyRow } from "@/lib/creative/performance/metrics"
import {
  attachPreviewFields,
  previewImagePath,
  safeViewUrl,
  type DashboardPreviewCacheRow,
} from "@/lib/creative/previews/dashboard"

const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"

function day(partial: Partial<CreativeDailyRow> & Pick<CreativeDailyRow, "platform" | "creativeKey">): CreativeDailyRow {
  return {
    creativeName: partial.creativeKey,
    creativeSize: null,
    lineItemId: "GOLF025SM1",
    adSetId: "238000001",
    adGroupName: "Avid Golfers",
    date: "2026-09-01",
    spend: 10,
    impressions: 1000,
    clicks: 10,
    viewableImpressions: null,
    videoViews: null,
    videoCompletions: null,
    conversions: null,
    ...partial,
  }
}

const HOSTILE: DashboardPreviewCacheRow[] = [
  {
    platform: "meta",
    creativeKey: "120001",
    blobPathname: "creative-previews/meta/120001.jpg",
    previewKind: "image",
    viewUrl: "https://fb.me/abc123",
    sourceHash: HASH,
  },
  {
    platform: "meta",
    creativeKey: "120002",
    blobPathname: "creative-previews/meta/120002.jpg",
    previewKind: "video",
    viewUrl: "https://scontent-syd2-1.xx.fbcdn.net/v/t45/abc.jpg?oe=1&_nc_sid=2",
    sourceHash: null,
  },
  {
    platform: "tiktok",
    creativeKey: "7001",
    blobPathname: "https://abc.private.blob.vercel-storage.com/creative-previews/tiktok/7001.webp",
    previewKind: "video",
    viewUrl: "http://p16-common-sign.tiktokcdn.com/obj/abc~tplv.jpeg",
    sourceHash: "not-hex!",
  },
  {
    platform: "tiktok",
    creativeKey: "7002",
    blobPathname: null,
    previewKind: "carousel",
    viewUrl: "https://www.facebook.com.evil.example/ads/1",
    sourceHash: HASH,
  },
]

describe("attachPreviewFields", () => {
  const ranked = groupAndRank(
    [
      day({ platform: "meta", creativeKey: "120001" }),
      day({ platform: "meta", creativeKey: "120002" }),
      day({ platform: "tiktok", creativeKey: "7001" }),
      day({ platform: "tiktok", creativeKey: "7002" }),
      day({ platform: "cm360", creativeKey: "banner-300x250" }),
    ],
    new Map(),
    "impressions",
  )
  const out = attachPreviewFields(ranked, HOSTILE)
  const byKey = Object.fromEntries(out.map((row) => [row.creativeKey, row]))

  it("never returns a Blob pathname, Blob host, fbcdn or tiktokcdn value", () => {
    const json = JSON.stringify(out)
    assert.equal(json.includes("fbcdn"), false)
    assert.equal(json.includes("tiktokcdn"), false)
    assert.equal(json.includes("vercel-storage"), false)
    assert.equal(json.includes(".jpg\""), false)
    assert.equal(json.includes(".webp"), false)
    for (const row of out) {
      if (row.previewUrl) assert.match(row.previewUrl, /^\/api\/creative-previews\/(meta|tiktok)\/[^/]+(\?v=[0-9a-f]{12})?$/)
    }
  })

  it("points previewUrl at the image route only when a blob exists", () => {
    assert.equal(byKey["120001"]?.previewUrl, `/api/creative-previews/meta/120001?v=${HASH.slice(0, 12)}`)
    assert.equal(byKey["120002"]?.previewUrl, "/api/creative-previews/meta/120002")
    assert.equal(byKey["7001"]?.previewUrl, "/api/creative-previews/tiktok/7001")
    assert.equal(byKey["7002"]?.previewUrl, null)
    assert.equal(byKey["banner-300x250"]?.previewUrl, null)
  })

  it("keeps previewKind and a Facebook view link from the cache row", () => {
    assert.equal(byKey["120001"]?.previewKind, "image")
    assert.equal(byKey["120001"]?.viewUrl, "https://fb.me/abc123")
    assert.equal(byKey["120002"]?.previewKind, "video")
    assert.equal(byKey["120002"]?.viewUrl, null)
    assert.equal(byKey["7002"]?.previewKind, null)
    assert.equal(byKey["7002"]?.viewUrl, null)
  })

  it("carries the ad set id and name from the warehouse", () => {
    assert.equal(byKey["120001"]?.adSetId, "238000001")
    assert.equal(byKey["120001"]?.adSetName, "Avid Golfers")
  })
})

describe("previewImagePath and safeViewUrl", () => {
  it("encodes the key", () => {
    assert.equal(previewImagePath("meta", "a/b c"), "/api/creative-previews/meta/a%2Fb%20c")
  })

  it("accepts only https Facebook and Instagram page links", () => {
    assert.equal(safeViewUrl("https://www.facebook.com/ads/library/?id=1"), "https://www.facebook.com/ads/library/?id=1")
    assert.equal(safeViewUrl("https://instagram.com/p/abc"), "https://instagram.com/p/abc")
    assert.equal(safeViewUrl("http://fb.me/abc"), null)
    assert.equal(safeViewUrl("https://external.xx.fbcdn.net/x.jpg"), null)
    assert.equal(safeViewUrl("https://user:pw@fb.me/abc"), null)
    assert.equal(safeViewUrl("javascript:alert(1)"), null)
    assert.equal(safeViewUrl(""), null)
  })
})
