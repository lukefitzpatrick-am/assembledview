import assert from "node:assert/strict"
import { test } from "node:test"

import {
  hasDeliveryFactActivity,
  lineHasDeliverySource,
  resolveDeliveryState,
} from "../deliveryState"

test("hasDeliveryFactActivity: impressions/clicks/views count; spend-only does not", () => {
  assert.equal(hasDeliveryFactActivity({ impressions: 10 }), true)
  assert.equal(hasDeliveryFactActivity({ clicks: 1 }), true)
  assert.equal(hasDeliveryFactActivity({ video3sViews: 4 }), true)
  assert.equal(hasDeliveryFactActivity({ impressions: 0, clicks: 0, results: 0, video3sViews: 0 }), false)
})

test("resolveDeliveryState: facts win over source", () => {
  assert.equal(resolveDeliveryState({ hasFactRows: true, hasSource: false }), "reported")
  assert.equal(resolveDeliveryState({ hasFactRows: true, hasSource: true }), "reported")
})

test("resolveDeliveryState: connected with no facts is no_rows_yet", () => {
  assert.equal(resolveDeliveryState({ hasFactRows: false, hasSource: true }), "no_rows_yet")
})

test("resolveDeliveryState: unconnected with no facts is no_source", () => {
  assert.equal(resolveDeliveryState({ hasFactRows: false, hasSource: false }), "no_source")
})

test("lineHasDeliverySource: search and classified social are connected", () => {
  assert.equal(lineHasDeliverySource({ group: "search" }), true)
  assert.equal(lineHasDeliverySource({ group: "social_meta" }), true)
  assert.equal(lineHasDeliverySource({ group: "social_tiktok" }), true)
  assert.equal(lineHasDeliverySource({ group: "social_reddit" }), true)
})

test("lineHasDeliverySource: plan_only is not connected", () => {
  assert.equal(lineHasDeliverySource({ group: "plan_only" }), false)
})

test("lineHasDeliverySource: programmatic/direct follow the delivery source map", () => {
  assert.equal(
    lineHasDeliverySource({ group: "programmatic_video", publisher: "Channel Factory" }),
    true,
  )
  assert.equal(
    lineHasDeliverySource({ group: "programmatic_display", publisher: "Unknown House" }),
    false,
  )
  assert.equal(
    lineHasDeliverySource({ group: "digital_display", publisher: "Seven" }),
    false,
  )
  assert.equal(
    lineHasDeliverySource({ group: "programmatic_display", platform: "DV360" }),
    true,
  )
})
