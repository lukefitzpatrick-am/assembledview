import assert from "node:assert/strict"
import test from "node:test"

import { loadBrandAssetCatalog, matchBrandAssets } from "@/lib/ava/brand/catalog"
import { getBrandAssetsTool } from "../getBrandAssets.js"
import type { AvaToolContext } from "../types.js"

const admin: AvaToolContext = {
  pageContext: undefined,
  clientSlug: undefined,
  mbaNumber: undefined,
  versionNumber: undefined,
  enabledMediaTypes: undefined,
  userSub: "u1",
  userEmail: "a@example.com",
  roles: ["admin"],
  clientSlugs: [],
  mbaNumbers: [],
  capturedPatch: null,
  capturedAttachments: null,
  capturedQuestions: null,
  pendingParsedPlan: null,
  capturedLineItemsLoad: null,
  currentLineItems: null,
}

const client: AvaToolContext = { ...admin, roles: ["client"] }

test("get_brand_assets: admin only", async () => {
  const denied = await getBrandAssetsTool.execute({ query: "sport" }, client)
  assert.equal(denied.isError, true)
  assert.match(denied.content, /Admin users only/)
})

test("get_brand_assets: kind and query filter, capped at 12", async () => {
  const catalog = loadBrandAssetCatalog()
  const photos = catalog.filter((asset) => asset.kind === "photo")
  const logos = catalog.filter((asset) => asset.kind === "logo")
  assert.ok(photos.length > 12)
  assert.ok(logos.length >= 1)

  const capped = matchBrandAssets(catalog, { kind: "photo" })
  assert.equal(capped.assets.length, 12)
  assert.equal(capped.truncated, photos.length - 12)
  assert.ok(capped.assets.every((asset) => asset.kind === "photo"))
  assert.ok(capped.assets.every((asset) => asset.url.includes("am-photo-")))

  const sport = await getBrandAssetsTool.execute({ kind: "photo", query: "sport" }, admin)
  assert.equal(sport.isError, false)
  const body = JSON.parse(sport.content) as {
    assets: { kind: string; tags: string[]; url: string }[]
  }
  assert.ok(body.assets.length >= 1)
  assert.ok(body.assets.length <= 12)
  assert.ok(
    body.assets.every(
      (asset) =>
        asset.kind === "photo" &&
        asset.url.startsWith("https://rzpuygzq2ull7c9x.public.blob.vercel-storage.com/am-photo-"),
    ),
  )
  assert.ok(body.assets.some((asset) => asset.tags.includes("sport-and-active")))

  const logo = await getBrandAssetsTool.execute({ kind: "logo", query: "full colour" }, admin)
  const logoBody = JSON.parse(logo.content) as { assets: { id: string; url: string }[] }
  assert.equal(logoBody.assets.length, 1)
  assert.equal(logoBody.assets[0]?.id, "full-colour")
  assert.match(logoBody.assets[0]!.url, /am-logo-full-colour\.png$/)
})
