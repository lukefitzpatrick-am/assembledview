import assert from "node:assert/strict"
import test from "node:test"
import JSZip from "jszip"

import { loadBrandAssetCatalog } from "@/lib/ava/brand/catalog"
import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import { parseReportCommentary } from "@/lib/reports/campaignReport/generateReportCommentary"
import { campaignReportFixture } from "../../../../scripts/smoke-campaign-report-fixture"

const MARKER = "COVER-PHOTO-MARKER"
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x00, 0x00, 0x00]),
  Buffer.from(MARKER),
])

function photoId(): string {
  const photo = loadBrandAssetCatalog().find((asset) => asset.kind === "photo")
  assert.ok(photo)
  return photo.id
}

function commentary(coverPhotoId?: string) {
  return {
    summary: "Search led the period and the plan is to hold it.",
    items: [
      {
        insight: "Search delivered the largest share of spend.",
        action: "Hold the search mix this month.",
        actionOwner: "Assembled",
        outcome: "Spend stays with the plan.",
        outcomeKind: "expected" as const,
      },
      {
        insight: "Social trailed search on delivery.",
        action: "Review social creative next week.",
        actionOwner: "Meta",
        outcome: "Delivery is measured again next period.",
        outcomeKind: "expected" as const,
      },
    ],
    ...(coverPhotoId ? { coverPhotoId } : {}),
  }
}

async function zipText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files)
  const chunks = await Promise.all(
    names
      .filter((name) => name.endsWith(".xml") || name.endsWith(".rels") || name.startsWith("ppt/media/"))
      .map(async (name) => {
        const file = zip.file(name)
        if (!file) return ""
        const bytes = await file.async("nodebuffer")
        return `${name}\n${bytes.toString("utf8")}`
      }),
  )
  return chunks.join("\n")
}

test("cover photo id is kept only when it is a catalogue photo", () => {
  const id = photoId()
  const kept = parseReportCommentary(commentary(id))
  assert.equal(kept.ok, true)
  if (kept.ok) assert.equal(kept.commentary.coverPhotoId, id)

  const dropped = parseReportCommentary(commentary("not-a-real-photo"))
  assert.equal(dropped.ok, true)
  if (dropped.ok) assert.equal(dropped.commentary.coverPhotoId, undefined)
  assert.equal(dropped.ok && dropped.commentary.items.length, 2)
})

test("deck without a cover photo does not fetch", async () => {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    throw new Error("fetch should not run")
  }
  const deck = await buildCampaignReportDeck(campaignReportFixture, { fetch: fetchImpl })
  assert.equal(calls, 0)
  const text = await zipText(deck)
  assert.match(text, /Campaign report/)
  assert.equal(text.includes(MARKER), false)
  assert.equal(text.includes("am-cover.jpg"), false)
})

test("deck places a cover photo on the cover picture placeholder", async () => {
  const id = photoId()
  const asset = loadBrandAssetCatalog().find((row) => row.id === id)
  assert.ok(asset)
  let requested = ""
  const fetchImpl: typeof fetch = async (input) => {
    requested = String(input)
    return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } })
  }
  const deck = await buildCampaignReportDeck(
    { ...campaignReportFixture, coverPhotoId: id },
    { fetch: fetchImpl },
  )
  assert.equal(requested, asset.url)
  assert.match(requested, /^https:\/\/rzpuygzq2ull7c9x\.public\.blob\.vercel-storage\.com\//)
  const text = await zipText(deck)
  assert.match(text, /Campaign report/)
  assert.match(text, /am-cover\.jpg/)
  assert.match(text, new RegExp(MARKER))
})

test("a failed cover photo fetch still builds the deck", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("network down")
  }
  const deck = await buildCampaignReportDeck(
    { ...campaignReportFixture, coverPhotoId: photoId() },
    { fetch: fetchImpl },
  )
  const text = await zipText(deck)
  assert.match(text, /Campaign report/)
  assert.equal(text.includes(MARKER), false)
  assert.equal(text.includes("am-cover.jpg"), false)
})
