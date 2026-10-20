import assert from "node:assert/strict"
import { test } from "node:test"

import {
  conversionPlatformsForGroup,
  conversionsByChannel,
  type LoadedConversions,
} from "../channelConversions"

const LOADED: LoadedConversions = {
  headline: "purchases",
  showRevenue: true,
  trackedPlatforms: ["meta_ads", "google_ads"],
  valuePlatforms: ["meta_ads"],
  throughDate: "2026-10-20",
  lines: [
    { lineItemId: "curatif004sm1", daily: [{ date: "2026-10-05", conversions: 5, purchases: 4, leads: 1, revenue: 400 }] },
    { lineItemId: "CURATIF004SE1", daily: [{ date: "2026-10-06", conversions: 10, purchases: 2, leads: 0, revenue: 0 }] },
    { lineItemId: "curatif004oh1", daily: [{ date: "2026-10-06", conversions: 99, purchases: 99, leads: 0, revenue: 9900 }] },
  ],
}

const CHANNELS = [
  { group: "social_meta", lines: [{ lineItemId: "curatif004sm1", spendToDate: 100 }] },
  { group: "search", lines: [{ lineItemId: "curatif004se1", spendToDate: 50 }] },
  { group: "programmatic_ooh", lines: [{ lineItemId: "curatif004oh1", spendToDate: 5000 }] },
  { group: "programmatic_display", lines: [{ lineItemId: "curatif004pd1", spendToDate: 900 }] },
]

test("snapshot groups map to the same platforms as the delivery sections", () => {
  assert.deepEqual(conversionPlatformsForGroup("social_meta"), ["meta_ads"])
  assert.deepEqual(conversionPlatformsForGroup("search"), ["google_ads"])
  assert.deepEqual(conversionPlatformsForGroup("programmatic_ooh"), [])
  assert.deepEqual(conversionPlatformsForGroup("assumed_spend"), [])
})

test("switch off returns null", () => {
  assert.equal(conversionsByChannel(CHANNELS, null), null)
})

test("per channel and campaign: OOH never counts; ROAS only on revenue-channel spend", () => {
  const out = conversionsByChannel(CHANNELS, LOADED)!
  assert.equal(out.label, "Purchases")
  const meta = out.byChannel.get("social_meta")!
  assert.equal(meta.count, 4)
  assert.equal(meta.revenue, 400)
  assert.equal(meta.roas, 4)
  assert.equal(meta.cpa, 25)
  const search = out.byChannel.get("search")!
  assert.equal(search.count, 2)
  assert.equal(search.revenue, null, "Google has no value event chosen")
  assert.equal(search.roas, null)
  assert.equal(out.byChannel.has("programmatic_ooh"), false)
  const display = out.byChannel.get("programmatic_display")!
  assert.equal(display.tracked, false)
  assert.equal(display.count, null)
  // Campaign: 4 + 2 purchases, $400 revenue over Meta spend only.
  assert.equal(out.total.count, 6)
  assert.equal(out.total.revenue, 400)
  assert.equal(out.total.roas, 4)
  assert.equal(out.total.spend, 150)
  assert.equal(out.byLine.get("curatif004se1")?.count, 2)
})

test("show revenue off: no revenue or ROAS anywhere", () => {
  const out = conversionsByChannel(CHANNELS, { ...LOADED, showRevenue: false })!
  assert.equal(out.total.revenue, null)
  assert.equal(out.total.roas, null)
  assert.equal(out.byChannel.get("social_meta")?.roas, null)
})

test("zero spend gives null ROAS and a $0 CPA (same rule as the tiles)", () => {
  const out = conversionsByChannel(
    [{ group: "social_meta", lines: [{ lineItemId: "curatif004sm1", spendToDate: 0 }] }],
    LOADED,
  )!
  assert.equal(out.total.roas, null)
  assert.equal(out.total.cpa, 0)
  assert.equal(out.total.count, 4)
})
