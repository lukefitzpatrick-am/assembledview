import assert from "node:assert/strict"
import test from "node:test"

import {
  PLATFORM_ACCOUNT_LABELS,
  PLATFORM_ACCOUNT_PLATFORMS,
  formatAccountRef,
  isMissingAdvertiserView,
  normaliseAccountRef,
  platformAccountChoices,
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
      "ga4",
      "gsc",
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

test("a missing advertiser view is recognised and a generic error is not", () => {
  const missing = new Error(
    "SQL compilation error: Object 'ASSEMBLEDVIEW.MART.V_PLATFORM_ADVERTISERS' does not exist or not authorized.",
  )
  assert.equal(isMissingAdvertiserView(missing), true)
  assert.equal(isMissingAdvertiserView(new Error("connection reset")), false)
})

test("formatAccountRef displays Google dashes, a Meta act_ prefix, and stored text otherwise", () => {
  assert.equal(formatAccountRef("google_ads", "4128893012"), "412-889-3012")
  assert.equal(formatAccountRef("google_ads", "412889301"), "412889301")
  assert.equal(formatAccountRef("meta_ads", "1033480917"), "act_1033480917")
  assert.equal(formatAccountRef("cm360", "BOSS Engineering"), "BOSS Engineering")
  assert.equal(formatAccountRef("dv360", "Molicare"), "Molicare")
  assert.equal(formatAccountRef("tiktok", "123456"), "123456")
  assert.equal(formatAccountRef("ga4", "123456"), "properties/123456")
  assert.equal(formatAccountRef("gsc", "sc-domain:example.com"), "sc-domain:example.com")
  assert.equal(formatAccountRef("gsc", "https://www.example.com/"), "https://www.example.com/")
})

test("ga4 stores digits from a property path, a bare id, or an Analytics URL", () => {
  assert.equal(normaliseAccountRef("ga4", "properties/123"), "123")
  assert.equal(normaliseAccountRef("ga4", "properties/123/"), "123")
  assert.equal(normaliseAccountRef("ga4", "123"), "123")
  assert.equal(
    normaliseAccountRef("ga4", "https://analytics.google.com/analytics/web/#/p213025502/reports/home"),
    "213025502",
  )
  assert.equal(
    normaliseAccountRef(
      "ga4",
      "https://analytics.google.com/analytics/web/#/a54516992p213025502/reports/home",
    ),
    "213025502",
  )
  assert.equal(
    normaliseAccountRef("ga4", "https://analytics.google.com/analytics/web/?property=998877"),
    "998877",
  )
  assert.throws(() => normaliseAccountRef("ga4", "properties/abc"), /digits/)
  assert.throws(() => normaliseAccountRef("ga4", "12a"), /digits/)
  assert.throws(() => normaliseAccountRef("ga4", ""), /digits/)
})

test("gsc stores the Fivetran site string, including the prefix or trailing slash", () => {
  assert.equal(normaliseAccountRef("gsc", "sc-domain:example.com"), "sc-domain:example.com")
  assert.equal(normaliseAccountRef("gsc", "  sc-domain:Example.com "), "sc-domain:Example.com")
  assert.equal(normaliseAccountRef("gsc", "https://www.example.com/"), "https://www.example.com/")
  assert.equal(normaliseAccountRef("gsc", "https://www.example.com"), "https://www.example.com")
  assert.throws(() => normaliseAccountRef("gsc", "example.com"), /sc-domain or a URL/)
  assert.throws(() => normaliseAccountRef("gsc", "   "), /empty/)
  assert.throws(() => normaliseAccountRef("gsc", "sc-domain:"), /sc-domain or a URL/)
})

test("ga4 and gsc stay off the choice list unless the web flag is 1", () => {
  assert.equal(PLATFORM_ACCOUNT_LABELS.ga4, "Google Analytics 4")
  assert.equal(PLATFORM_ACCOUNT_LABELS.gsc, "Search Console")
  assert.ok(!platformAccountChoices(undefined).includes("ga4"))
  assert.ok(!platformAccountChoices(undefined).includes("gsc"))
  assert.ok(!platformAccountChoices("").includes("ga4"))
  assert.ok(platformAccountChoices("1").includes("ga4"))
  assert.ok(platformAccountChoices("1").includes("gsc"))
  assert.equal(platformAccountChoices("1").length, PLATFORM_ACCOUNT_PLATFORMS.length)
})
