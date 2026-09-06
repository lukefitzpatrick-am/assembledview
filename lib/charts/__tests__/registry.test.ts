import assert from "node:assert/strict"
import test from "node:test"

import { lineChannelEnum } from "@/db/schema/enums"
import {
  getMediaColor,
  getMediaLabel,
  isMediaTypeRegistryKey,
  MEDIA_TYPE_REGISTRY,
  normalizeEntityKey,
} from "@/lib/charts/registry"
import {
  CAMPAIGN_LIST_MEDIA_TYPE_FLAGS,
  campaignMediaTypeTagLabels,
} from "@/lib/dashboard/campaignMediaTypeTags"

const REGISTRY_KEYS = Object.keys(MEDIA_TYPE_REGISTRY)
const LINE_CHANNELS = lineChannelEnum.enumValues

function assertRegistryColour(input: string) {
  assert.equal(
    isMediaTypeRegistryKey(input),
    true,
    `expected registry colour, got fallback for ${JSON.stringify(input)} → ${normalizeEntityKey(input)}`,
  )
  const n = normalizeEntityKey(input) as keyof typeof MEDIA_TYPE_REGISTRY
  assert.equal(getMediaColor(input), MEDIA_TYPE_REGISTRY[n].color)
}

test("MEDIA_TYPE_REGISTRY has 20 canonical channels", () => {
  assert.equal(REGISTRY_KEYS.length, 20)
})

test("every registry key gets a non-fallback colour", () => {
  for (const key of REGISTRY_KEYS) assertRegistryColour(key)
})

test("every line_channel enum value gets a non-fallback colour", () => {
  assert.equal(LINE_CHANNELS.length, 20)
  for (const key of LINE_CHANNELS) assertRegistryColour(key)
})

test("campaign list compact keys and registry labels get a non-fallback colour", () => {
  assert.equal(CAMPAIGN_LIST_MEDIA_TYPE_FLAGS.length, 19)
  for (const [, compactKey] of CAMPAIGN_LIST_MEDIA_TYPE_FLAGS) {
    assertRegistryColour(compactKey)
    const label = getMediaLabel(compactKey)
    assertRegistryColour(label)
  }
  assertRegistryColour("production")
  assertRegistryColour("Production")
})

test("campaignMediaTypeTagLabels emit registry labels for radio and newspaper", () => {
  const labels = campaignMediaTypeTagLabels({
    mp_radio: true,
    mp_newspaper: "true",
  })
  assert.deepEqual(labels, ["Radio", "Newspaper"])
  for (const label of labels) assertRegistryColour(label)
})
