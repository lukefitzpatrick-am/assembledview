import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { LINE_CHANNELS } from "../enums"
import {
  ATTRS_CHANNEL_KEYS,
  lineItemAttrsByChannel,
  parseLineItemAttrs,
} from "../lineItemAttrs"

describe("lineItemAttrs golden — every line_channel has a validator", () => {
  it("covers every LINE_CHANNELS enum value", () => {
    for (const channel of LINE_CHANNELS) {
      assert.ok(
        channel in lineItemAttrsByChannel,
        `missing attrs validator for channel: ${channel}`,
      )
    }
  })

  it("has no extra channel keys beyond the enum", () => {
    for (const key of ATTRS_CHANNEL_KEYS) {
      assert.ok(
        (LINE_CHANNELS as readonly string[]).includes(key),
        `attrs map has unknown channel: ${key}`,
      )
    }
    assert.equal(ATTRS_CHANNEL_KEYS.length, LINE_CHANNELS.length)
  })

  it("passthrough keeps legacy unknown keys", () => {
    const parsed = parseLineItemAttrs("television", {
      network: "Seven",
      station: "HSV7",
      legacy_extra: "keep-me",
    })
    assert.equal(parsed.network, "Seven")
    assert.equal(
      (parsed as { legacy_extra?: string }).legacy_extra,
      "keep-me",
    )
  })

  it("accepts empty / nullish attrs objects", () => {
    for (const channel of LINE_CHANNELS) {
      assert.doesNotThrow(() => parseLineItemAttrs(channel, {}))
      assert.doesNotThrow(() => parseLineItemAttrs(channel, null))
      assert.doesNotThrow(() => parseLineItemAttrs(channel, undefined))
    }
  })
})
