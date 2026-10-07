import assert from "node:assert/strict"
import test from "node:test"

import { BRAND, hexToArgb } from "@/lib/brand"
import {
  CHART_PALETTE,
  CHANNEL_COLORS,
  DIVERGING_MIXED_STOPS,
  SEQUENTIAL_MIXED_STOPS,
  STATUS,
} from "@/lib/chart-theme"
import { FALLBACK_PALETTE, getMediaBadgeStyle } from "@/lib/charts/registry"
import {
  familyColour,
  MEDIA_FAMILY,
  MEDIA_TYPE_FAMILY,
  type MediaFamily,
  type MediaTypeThemeKey,
} from "@/lib/design/mediaFamilies"
import { MEDIA_TYPE_COLORS } from "@/lib/media/mediaTypes"
import { mediaTypeTheme } from "@/lib/utils"
import {
  mediaTypeAccentTextStyle,
  mediaTypeLineItemBadgeStyle,
} from "@/lib/mediaplan/mediaTypeAccents"

const NEUTRAL_PILL = {
  backgroundColor: "var(--tone-neutral-bg)",
  color: "var(--tone-neutral-fg)",
  borderColor: "transparent",
}

function collectHex(value: unknown, into: Set<string>): void {
  if (typeof value === "string" && value.startsWith("#")) {
    into.add(value.toUpperCase())
    return
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectHex(nested, into)
  }
}

const BRAND_HEX = new Set<string>()
collectHex(BRAND, BRAND_HEX)

const DERIVED_RAMP_STOPS = new Set(
  [...SEQUENTIAL_MIXED_STOPS, ...DIVERGING_MIXED_STOPS].map((stop) => stop.toUpperCase()),
)

function isBrandOrRamp(value: string): boolean {
  const upper = value.toUpperCase()
  if (upper.startsWith("#")) return BRAND_HEX.has(upper) || DERIVED_RAMP_STOPS.has(upper)
  if (/^FF[0-9A-F]{6}$/.test(upper)) return BRAND_HEX.has(`#${upper.slice(2)}`)
  return false
}

test("every mediaTypeTheme key maps to a family and every family has a brand colour", () => {
  const themeKeys = Object.keys(mediaTypeTheme.colors)
  const familyKeys = Object.keys(MEDIA_TYPE_FAMILY)
  assert.deepEqual(themeKeys.toSorted(), familyKeys.toSorted())

  for (const key of themeKeys) {
    const themeKey = key as MediaTypeThemeKey
    const family = MEDIA_TYPE_FAMILY[themeKey]
    assert.ok(family)
    assert.equal(mediaTypeTheme.colors[themeKey], familyColour(themeKey))
    assert.equal(familyColour(themeKey), MEDIA_FAMILY[family].colour)
  }

  const brandColours = new Set(Object.values(BRAND.colour).map((colour) => colour.toUpperCase()))
  for (const family of Object.keys(MEDIA_FAMILY) as MediaFamily[]) {
    assert.ok(brandColours.has(MEDIA_FAMILY[family].colour.toUpperCase()), family)
  }
})

test("spot checks: television, socialmedia, progooh, newspaper, production", () => {
  assert.equal(MEDIA_TYPE_FAMILY.television, "video")
  assert.equal(familyColour("television"), BRAND.colour.forest)
  assert.equal(MEDIA_TYPE_FAMILY.socialmedia, "social")
  assert.equal(familyColour("socialmedia"), BRAND.colour.sky)
  assert.equal(MEDIA_TYPE_FAMILY.progooh, "out_of_home")
  assert.equal(familyColour("progooh"), BRAND.colour.forestLight)
  assert.equal(MEDIA_TYPE_FAMILY.newspaper, "print")
  assert.equal(familyColour("newspaper"), BRAND.colour.contextBlack)
  assert.equal(MEDIA_TYPE_COLORS.newspaper, hexToArgb(familyColour("newspaper")))
  assert.equal(MEDIA_TYPE_FAMILY.production, "production")
  assert.equal(familyColour("production"), BRAND.colour.context)
  assert.equal(MEDIA_TYPE_COLORS.production, hexToArgb(familyColour("production")))
})

test("media colour is not text and the line badge is the neutral pill", () => {
  const text = mediaTypeAccentTextStyle("#B5D337")
  assert.equal(String(text.color).includes("#"), false)
  assert.deepEqual(mediaTypeLineItemBadgeStyle("#B5D337"), {
    backgroundColor: "var(--tone-neutral-bg)",
    color: "var(--tone-neutral-fg)",
  })
})

test("getMediaBadgeStyle is the neutral pill for known, empty, and unknown", () => {
  assert.deepEqual(getMediaBadgeStyle("Television"), NEUTRAL_PILL)
  assert.deepEqual(getMediaBadgeStyle(""), NEUTRAL_PILL)
  assert.deepEqual(getMediaBadgeStyle("Unknown thing"), NEUTRAL_PILL)
})

test("chart and media colours are brand values, or a documented derived ramp stop", () => {
  const values = [
    ...CHART_PALETTE,
    ...FALLBACK_PALETTE,
    ...Object.values(STATUS),
    ...Object.values(CHANNEL_COLORS),
    ...Object.values(MEDIA_TYPE_COLORS),
  ]
  for (const value of values) {
    assert.equal(isBrandOrRamp(value), true, value)
  }
  assert.equal(MEDIA_TYPE_COLORS.television, hexToArgb(familyColour("television")))
  assert.equal(MEDIA_TYPE_COLORS.socialMedia, hexToArgb(familyColour("socialmedia")))
  assert.equal(MEDIA_TYPE_COLORS.progOoh, hexToArgb(familyColour("progooh")))
})
