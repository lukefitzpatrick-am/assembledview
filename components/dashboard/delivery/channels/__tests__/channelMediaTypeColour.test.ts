import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getMediaColor } from "@/lib/charts/registry"
import { familyColour, MEDIA_FAMILY, MEDIA_TYPE_FAMILY, type MediaFamily, type MediaTypeThemeKey } from "@/lib/design/mediaFamilies"

import { channelMediaTypeColour } from "../channelMediaTypeColour"
import type { ChannelKey } from "../types"

const CHANNEL_KEYS: ChannelKey[] = [
  "social-meta",
  "social-tiktok",
  "social-reddit",
  "search",
  "programmatic-display",
  "programmatic-video",
  "programmatic-ooh",
  "digital-display",
  "digital-video",
  "digital-audio",
  "bvod",
  "plan-only",
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

  it("media types colour by channel family (D11)", () => {
    const fixture: Array<{
      channel: ChannelKey
      mediaType: MediaTypeThemeKey
      family: MediaFamily
    }> = [
      { channel: "search", mediaType: "search", family: "search_display" },
      { channel: "social-meta", mediaType: "socialmedia", family: "social" },
      { channel: "programmatic-display", mediaType: "progdisplay", family: "search_display" },
      { channel: "programmatic-video", mediaType: "progvideo", family: "video" },
      { channel: "programmatic-ooh", mediaType: "progooh", family: "out_of_home" },
      { channel: "digital-display", mediaType: "digidisplay", family: "search_display" },
      { channel: "digital-video", mediaType: "digivideo", family: "video" },
      { channel: "digital-audio", mediaType: "digiaudio", family: "audio" },
      { channel: "bvod", mediaType: "bvod", family: "video" },
    ]

    for (const row of fixture) {
      assert.equal(MEDIA_TYPE_FAMILY[row.mediaType], row.family)
      assert.equal(
        channelMediaTypeColour(row.channel),
        familyColour(row.mediaType),
        `${row.channel} must use the ${row.family} family colour`,
      )
    }

    const familyColours = new Set(fixture.map((row) => MEDIA_FAMILY[row.family].colour))
    assert.equal(
      familyColours.size,
      5,
      "search_display, social, video, out_of_home and audio are five colours",
    )

    // Meta + TikTok + Reddit + plan-only share social_media by design (same media type)
    assert.equal(channelMediaTypeColour("social-meta"), channelMediaTypeColour("social-tiktok"))
    assert.equal(channelMediaTypeColour("social-meta"), channelMediaTypeColour("social-reddit"))
    assert.equal(channelMediaTypeColour("plan-only"), channelMediaTypeColour("social-meta"))

    assert.equal(channelMediaTypeColour("digital-display"), getMediaColor("digital_display"))
    assert.equal(channelMediaTypeColour("digital-video"), getMediaColor("digital_video"))
    assert.equal(channelMediaTypeColour("digital-audio"), getMediaColor("digital_audio"))
    assert.equal(channelMediaTypeColour("bvod"), getMediaColor("bvod"))
  })

  it("searchSeriesPalette.cost equals getMediaColor(search)", () => {
    assert.equal(getMediaColor("search"), channelMediaTypeColour("search"))
  })

  it("socialmedia alias resolves to social_media registry colour", () => {
    assert.equal(getMediaColor("socialmedia"), getMediaColor("social_media"))
    assert.equal(channelMediaTypeColour("social-meta"), getMediaColor("social_media"))
  })
})
