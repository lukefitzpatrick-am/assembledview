import assert from "node:assert/strict"
import test from "node:test"

import { classifySocialPacingPlatform } from "../classifySocialPacingPlatform"

test("Reddit platform string matches case-insensitively", () => {
  assert.equal(classifySocialPacingPlatform({ platform: "Reddit" }), "reddit")
  assert.equal(classifySocialPacingPlatform({ platform: "social - reddit" }), "reddit")
  assert.equal(classifySocialPacingPlatform({ platform: "REDDIT ADS" }), "reddit")
})

test("Reddit name token fallback matches like TikTok", () => {
  assert.equal(
    classifySocialPacingPlatform({ line_item_name: "Always-on REDDIT prospecting" }),
    "reddit",
  )
})

test("Reddit is not classified as Meta", () => {
  assert.equal(classifySocialPacingPlatform({ platform: "Reddit" }), "reddit")
  assert.notEqual(classifySocialPacingPlatform({ platform: "Reddit" }), "meta")
})

test("Meta and TikTok still classify first from platform", () => {
  assert.equal(classifySocialPacingPlatform({ platform: "Meta" }), "meta")
  assert.equal(classifySocialPacingPlatform({ platform: "TikTok" }), "tiktok")
})

test("unclassified social stays null", () => {
  assert.equal(classifySocialPacingPlatform({ platform: "LinkedIn" }), null)
})
