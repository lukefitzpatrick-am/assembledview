import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MEDIA_TYPE_REGISTRY } from "@/lib/charts/registry"

import { channelMediaTypeColour } from "../../channels/channelMediaTypeColour"
import type { ChannelKey } from "../../channels/types"
import {
  DELIVERY_DAILY_METRIC_LINE_COLOR,
  DELIVERY_DAILY_METRIC_LINE_THEME_HEXES,
} from "../deliveryDailyChartColors"

const CHANNEL_KEYS: ChannelKey[] = [
  "social-meta",
  "social-tiktok",
  "search",
  "programmatic-display",
  "programmatic-video",
  "ad-serving",
]

function norm(hex: string): string {
  return hex.trim().toLowerCase()
}

describe("DeliveryDailyChart metric line colour", () => {
  it("uses theme ink, not a STATUS token string", () => {
    assert.equal(DELIVERY_DAILY_METRIC_LINE_COLOR, "var(--av-ink)")
  })

  it("keeps every ChannelKey bar colour distinct from the metric line (both theme inks)", () => {
    for (const key of CHANNEL_KEYS) {
      const bar = channelMediaTypeColour(key)
      assert.notEqual(norm(bar), norm(DELIVERY_DAILY_METRIC_LINE_COLOR), `${key} bar equals CSS var`)
      for (const ink of DELIVERY_DAILY_METRIC_LINE_THEME_HEXES) {
        assert.notEqual(
          norm(bar),
          norm(ink),
          `${key} bar ${bar} collides with metric line theme ink ${ink}`,
        )
      }
    }
  })

  it("keeps all MEDIA_TYPE_REGISTRY colours distinct from both metric line theme inks", () => {
    for (const [key, row] of Object.entries(MEDIA_TYPE_REGISTRY)) {
      for (const ink of DELIVERY_DAILY_METRIC_LINE_THEME_HEXES) {
        assert.notEqual(
          norm(row.color),
          norm(ink),
          `registry ${key} ${row.color} collides with metric line theme ink ${ink}`,
        )
      }
    }
  })
})
