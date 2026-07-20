/**
 * Asserts ExpertCard card-surface (key, label) lists for Search / OOH / Radio / Cinema
 * match descriptor fields where surfaces !== "grid".
 */
import assert from "node:assert/strict"
import test from "node:test"

import { getExpertCardRenderedFields } from "@/components/media-containers/ExpertCard"
import {
  getExpertCardSurfaceFields,
  type ExpertGridChannelConfig,
  CINEMA_EXPERT_CHANNEL_CONFIG,
  INFLUENCERS_EXPERT_CHANNEL_CONFIG,
  OOH_EXPERT_CHANNEL_CONFIG,
  RADIO_EXPERT_CHANNEL_CONFIG,
  SEARCH_EXPERT_CHANNEL_CONFIG,
} from "@/lib/mediaplan/expertGridChannelConfig"

function expectedCardFields(
  config: ExpertGridChannelConfig<any>
): { key: string; label: string }[] {
  return getExpertCardSurfaceFields(config).map(({ key, label }) => ({
    key,
    label,
  }))
}

test("Search ExpertCard rendered fields equal descriptor card-surface fields", () => {
  const rendered = getExpertCardRenderedFields(SEARCH_EXPERT_CHANNEL_CONFIG)
  const expected = expectedCardFields(SEARCH_EXPERT_CHANNEL_CONFIG)
  assert.deepEqual(rendered, expected)
  assert.deepEqual(
    rendered.map((f) => f.key),
    [
      "platform",
      "bidStrategy",
      "buyType",
      "creativeTargeting",
      "creative",
      "market",
      "buyingDemo",
    ]
  )
  assert.ok(!rendered.some((f) => f.key === "startDate"))
  assert.ok(!rendered.some((f) => f.key === "endDate"))
  assert.ok(!rendered.some((f) => f.key === "unitRate"))
  assert.ok(!rendered.some((f) => f.key === "netMedia"))
})

test("OOH ExpertCard rendered fields equal descriptor card-surface fields", () => {
  const rendered = getExpertCardRenderedFields(OOH_EXPERT_CHANNEL_CONFIG)
  const expected = expectedCardFields(OOH_EXPERT_CHANNEL_CONFIG)
  assert.deepEqual(rendered, expected)
  assert.deepEqual(
    rendered.map((f) => f.key),
    [
      "network",
      "format",
      "buyType",
      "placement",
      "type",
      "size",
      "market",
      "buyingDemo",
    ]
  )
  assert.ok(!rendered.some((f) => f.key === "startDate"))
  assert.ok(!rendered.some((f) => f.key === "endDate"))
  assert.ok(!rendered.some((f) => f.key === "unitRate"))
})

test("Radio ExpertCard rendered fields equal descriptor card-surface fields", () => {
  const rendered = getExpertCardRenderedFields(RADIO_EXPERT_CHANNEL_CONFIG)
  const expected = expectedCardFields(RADIO_EXPERT_CHANNEL_CONFIG)
  assert.deepEqual(rendered, expected)
  assert.deepEqual(
    rendered.map((f) => f.key),
    [
      "network",
      "station",
      "buyType",
      "placement",
      "duration",
      "format",
      "market",
      "buyingDemo",
    ]
  )
  assert.ok(!rendered.some((f) => f.key === "startDate"))
  assert.ok(!rendered.some((f) => f.key === "endDate"))
  assert.ok(!rendered.some((f) => f.key === "unitRate"))
})

test("Cinema ExpertCard rendered fields equal descriptor card-surface fields", () => {
  const rendered = getExpertCardRenderedFields(CINEMA_EXPERT_CHANNEL_CONFIG)
  const expected = expectedCardFields(CINEMA_EXPERT_CHANNEL_CONFIG)
  assert.deepEqual(rendered, expected)
  assert.deepEqual(
    rendered.map((f) => f.key),
    [
      "network",
      "station",
      "buyType",
      "placement",
      "duration",
      "format",
      "market",
      "buyingDemo",
    ]
  )
  assert.ok(!rendered.some((f) => f.key === "startDate"))
  assert.ok(!rendered.some((f) => f.key === "endDate"))
  assert.ok(!rendered.some((f) => f.key === "unitRate"))
})

test("Influencers ExpertCard surfaces Platform/Objective/Campaign/Buy Type/Targeting only", () => {
  const rendered = getExpertCardRenderedFields(INFLUENCERS_EXPERT_CHANNEL_CONFIG)
  const expected = expectedCardFields(INFLUENCERS_EXPERT_CHANNEL_CONFIG)
  assert.deepEqual(rendered, expected)
  assert.deepEqual(rendered, [
    { key: "platform", label: "Platform" },
    { key: "objective", label: "Objective" },
    { key: "campaign", label: "Campaign" },
    { key: "buyType", label: "Buy Type" },
    { key: "targetingAttribute", label: "Targeting" },
  ])
  for (const socialKey of [
    "bidStrategy",
    "creativeTargeting",
    "creative",
    "market",
    "buyingDemo",
  ]) {
    assert.ok(
      !rendered.some((f) => f.key === socialKey),
      `Influencers card must not render Social-style field ${socialKey}`
    )
  }
})
