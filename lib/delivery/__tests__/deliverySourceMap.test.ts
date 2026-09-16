import assert from "node:assert/strict"
import test from "node:test"

import {
  lookupActiveDeliverySource,
  PROGRAMMATIC_DELIVERY_SOURCE_SEED,
  snowflakeChannelsForDeliverySource,
} from "../deliverySourceMap"

test("Channel Factory maps to partner_file with no modelled plan-rate spend", () => {
  const row = lookupActiveDeliverySource("channel factory", PROGRAMMATIC_DELIVERY_SOURCE_SEED)
  assert.ok(row)
  assert.equal(row.publisher_key, "channel factory")
  assert.equal(row.delivery_source, "partner_file")
  assert.equal(row.derive_spend_from_plan, false)
  assert.equal(row.active, true)
})

test("partner_file consumes the DSP container channel", () => {
  assert.deepEqual(
    [...snowflakeChannelsForDeliverySource("partner_file", "programmatic-video")],
    ["programmatic-video"],
  )
  assert.deepEqual(
    [...snowflakeChannelsForDeliverySource("partner_file", "programmatic-display")],
    ["programmatic-display"],
  )
})

test("Vistar and Broadsign map to partner_file with no modelled plan-rate spend", () => {
  for (const key of ["vistar", "broadsign"] as const) {
    const row = lookupActiveDeliverySource(key, PROGRAMMATIC_DELIVERY_SOURCE_SEED)
    assert.ok(row, `expected ${key} in the seed`)
    assert.equal(row.publisher_key, key)
    assert.equal(row.delivery_source, "partner_file")
    assert.equal(row.derive_spend_from_plan, false)
    assert.equal(row.active, true)
  }
})

test("partner_file + prog_ooh maps to programmatic-ooh; omitting lineChannel is unchanged", () => {
  const ooh = snowflakeChannelsForDeliverySource("partner_file", "programmatic-video", "prog_ooh")
  assert.ok(ooh.has("programmatic-ooh"))
  assert.deepEqual(
    [...snowflakeChannelsForDeliverySource("partner_file", "programmatic-video")],
    ["programmatic-video"],
  )
  assert.deepEqual(
    [...snowflakeChannelsForDeliverySource("partner_file", "programmatic-video", "prog_video")],
    ["programmatic-video"],
  )
})

test("Twitch maps to cm360 with modelled plan-rate spend", () => {
  const row = lookupActiveDeliverySource("twitch", PROGRAMMATIC_DELIVERY_SOURCE_SEED)
  assert.ok(row)
  assert.equal(row.publisher_key, "twitch")
  assert.equal(row.delivery_source, "cm360")
  assert.equal(row.derive_spend_from_plan, true)
  assert.equal(row.active, true)
})

test("unknown delivery source still has no Snowflake channel", () => {
  assert.deepEqual([...snowflakeChannelsForDeliverySource("cm360", "programmatic-video")], ["ad-serving"])
  assert.deepEqual([...snowflakeChannelsForDeliverySource("dsp", "programmatic-video")], ["programmatic-video"])
})
