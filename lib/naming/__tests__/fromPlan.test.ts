import assert from "node:assert/strict"
import test from "node:test"

import { looksLikeNative, looksLikeYoutube } from "../fromPlan.js"

function pub(publisher: string): Record<string, unknown> {
  return { publisher }
}

test("looksLikeYoutube: matches youtube substring or yt token", () => {
  assert.equal(looksLikeYoutube(pub("yt")), true)
  assert.equal(looksLikeYoutube(pub("YouTube")), true)
  assert.equal(looksLikeYoutube(pub("youtube.com")), true)
  assert.equal(looksLikeYoutube(pub("YT Reserve")), true)
})

test("looksLikeYoutube: rejects non-youtube publishers", () => {
  assert.equal(looksLikeYoutube(pub("nine")), false)
  assert.equal(looksLikeYoutube(pub("sytycd")), false)
  assert.equal(looksLikeYoutube(pub("nightyt")), false)
  assert.equal(looksLikeYoutube(pub("")), false)
})

test("looksLikeNative: matches taboola/outbrain or native token", () => {
  assert.equal(looksLikeNative(pub("Taboola")), true)
  assert.equal(looksLikeNative(pub("Outbrain")), true)
  assert.equal(looksLikeNative(pub("Native")), true)
  assert.equal(looksLikeNative(pub("native display")), true)
})

test("looksLikeNative: rejects substring-only native and unrelated text", () => {
  assert.equal(looksLikeNative(pub("alternative")), false)
  assert.equal(looksLikeNative(pub("innative")), false)
  assert.equal(looksLikeNative(pub("nine")), false)
  assert.equal(looksLikeNative(pub("")), false)
})
