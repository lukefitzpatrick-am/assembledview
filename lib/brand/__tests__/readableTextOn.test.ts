import assert from "node:assert/strict"
import test from "node:test"

import { BRAND, readableTextOn } from "../index"

test("lime text is ink", () => {
  assert.equal(readableTextOn(BRAND.colour.lime), BRAND.colour.ink)
})

test("forest text is white", () => {
  assert.equal(readableTextOn(BRAND.colour.forest), BRAND.colour.white)
})

test("sand text is ink", () => {
  assert.equal(readableTextOn(BRAND.colour.sand), BRAND.colour.ink)
})

test("ink text is white", () => {
  assert.equal(readableTextOn(BRAND.colour.ink), BRAND.colour.white)
})
