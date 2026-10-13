import assert from "node:assert/strict"
import test from "node:test"

import {
  PLATFORM_ACCOUNT_PLATFORMS,
  formatAccountRef,
  normaliseAccountRef,
} from "../platformAccounts"

const DIGIT_PLATFORMS = [
  "meta_ads",
  "google_ads",
  "tiktok",
  "reddit",
  "taboola",
  "vistar",
  "channel_factory",
] as const

const TEXT_PLATFORMS = ["cm360", "dv360", "linkedin", "pinterest", "snapchat"] as const

test("platform list matches the check constraint", () => {
  assert.deepEqual(
    [...PLATFORM_ACCOUNT_PLATFORMS],
    [
      "meta_ads",
      "google_ads",
      "cm360",
      "dv360",
      "tiktok",
      "reddit",
      "taboola",
      "vistar",
      "channel_factory",
      "linkedin",
      "pinterest",
      "snapchat",
    ],
  )
})

test("meta strips act_ and keeps digits", () => {
  assert.equal(normaliseAccountRef("meta_ads", "act_1033480917"), "1033480917")
  assert.equal(normaliseAccountRef("meta_ads", "Act_1033480917"), "1033480917")
})

test("google strips dashes and spaces", () => {
  assert.equal(normaliseAccountRef("google_ads", "412-889-3012"), "4128893012")
  assert.equal(normaliseAccountRef("google_ads", " 412 889 3012 "), "4128893012")
})

test("other numeric platforms keep digits only", () => {
  for (const platform of ["tiktok", "reddit", "taboola", "vistar", "channel_factory"] as const) {
    assert.equal(normaliseAccountRef(platform, "act_12-34 56"), "123456")
  }
})

test("cm360 and dv360 keep the trimmed advertiser name", () => {
  assert.equal(normaliseAccountRef("cm360", "  BOSS Engineering "), "BOSS Engineering")
  assert.equal(normaliseAccountRef("dv360", "  Molicare "), "Molicare")
})

test("linkedin, pinterest and snapchat keep trimmed text", () => {
  for (const platform of ["linkedin", "pinterest", "snapchat"] as const) {
    assert.equal(normaliseAccountRef(platform, "  Acme Ads "), "Acme Ads")
  }
})

test("empty and non-digit numeric refs are rejected", () => {
  assert.throws(() => normaliseAccountRef("meta_ads", "act_"), /digits/)
  assert.throws(() => normaliseAccountRef("google_ads", "---"), /digits/)
  assert.throws(() => normaliseAccountRef("tiktok", "12a34"), /digits/)
  assert.throws(() => normaliseAccountRef("cm360", "   "), /empty/)
  assert.throws(() => normaliseAccountRef("dv360", ""), /empty/)
  assert.throws(() => normaliseAccountRef("not_a_platform", "1"), /platform/)
})

test("every platform normalises a non-empty value", () => {
  for (const platform of DIGIT_PLATFORMS) {
    assert.match(normaliseAccountRef(platform, "act_99-1"), /^\d+$/)
  }
  for (const platform of TEXT_PLATFORMS) {
    assert.equal(normaliseAccountRef(platform, " Hartmans "), "Hartmans")
  }
})

test("formatAccountRef displays Google dashes, a Meta act_ prefix, and stored text otherwise", () => {
  assert.equal(formatAccountRef("google_ads", "4128893012"), "412-889-3012")
  assert.equal(formatAccountRef("google_ads", "412889301"), "412889301")
  assert.equal(formatAccountRef("meta_ads", "1033480917"), "act_1033480917")
  assert.equal(formatAccountRef("cm360", "BOSS Engineering"), "BOSS Engineering")
  assert.equal(formatAccountRef("dv360", "Molicare"), "Molicare")
  assert.equal(formatAccountRef("tiktok", "123456"), "123456")
})
