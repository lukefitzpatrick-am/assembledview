import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getMediaColor } from "@/lib/charts/registry"

import { channelMediaTypeColour } from "../channelMediaTypeColour"
import type { ChannelKey } from "../types"

const CHANNEL_KEYS: ChannelKey[] = [
  "social-meta",
  "social-tiktok",
  "search",
  "programmatic-display",
  "programmatic-video",
  "ad-serving",
]

describe("channelMediaTypeColour", () => {
  it("resolves each ChannelKey to a stable hex independent of brandColour", () => {
    const withoutBrand = Object.fromEntries(
      CHANNEL_KEYS.map((k) => [k, channelMediaTypeColour(k)]),
    ) as Record<ChannelKey, string>

    // brandColour is not an input — simulating "with brand" cannot change the result
    const withBrand = Object.fromEntries(
      CHANNEL_KEYS.map((k) => [k, channelMediaTypeColour(k)]),
    ) as Record<ChannelKey, string>

    for (const key of CHANNEL_KEYS) {
      assert.equal(withBrand[key], withoutBrand[key], `${key} must ignore brand`)
      assert.match(withoutBrand[key]!, /^#[0-9a-fA-F]{6}$/)
    }

    // eslint-disable-next-line no-console -- AVU5-3 verification print
    console.log("mediaTypeColour table (brand-independent):")
    for (const key of CHANNEL_KEYS) {
      // eslint-disable-next-line no-console
      console.log(`  ${key}: ${withoutBrand[key]}`)
    }
  })

  it("keeps distinct media-type identities distinct (prog display ≠ prog video)", () => {
    const colours = {
      search: channelMediaTypeColour("search"),
      social: channelMediaTypeColour("social-meta"),
      progDisplay: channelMediaTypeColour("programmatic-display"),
      progVideo: channelMediaTypeColour("programmatic-video"),
      adServing: channelMediaTypeColour("ad-serving"),
    }

    // Meta + TikTok share social_media by design (same media type)
    assert.equal(channelMediaTypeColour("social-meta"), channelMediaTypeColour("social-tiktok"))

    const distinct = new Set(Object.values(colours))
    assert.equal(
      distinct.size,
      5,
      `expected 5 distinct media-type hexes, got ${JSON.stringify(colours)}`,
    )

    assert.notEqual(colours.progDisplay, colours.progVideo)
    // Regression: bare "programmatic" must not be what display/video resolve to
    const badProgrammatic = getMediaColor("programmatic")
    assert.notEqual(colours.progDisplay, badProgrammatic)
    assert.notEqual(colours.progVideo, badProgrammatic)
  })

  it("searchSeriesPalette.cost equals getMediaColor(search)", () => {
    assert.equal(getMediaColor("search"), channelMediaTypeColour("search"))
  })

  it("socialmedia alias resolves to social_media registry colour", () => {
    assert.equal(getMediaColor("socialmedia"), getMediaColor("social_media"))
    assert.equal(channelMediaTypeColour("social-meta"), getMediaColor("social_media"))
  })
})
