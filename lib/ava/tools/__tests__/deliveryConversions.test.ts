import assert from "node:assert/strict"
import { test } from "node:test"

import {
  deliveryConversionsBlock,
  readDeliveryConversions,
  type LoadConversionsFn,
} from "../deliveryConversions"
import type { LoadedConversions } from "@/lib/delivery/conversions/channelConversions"

const LOADED: LoadedConversions = {
  headline: "leads",
  showRevenue: true,
  trackedPlatforms: ["meta_ads", "dv360"],
  valuePlatforms: ["meta_ads"],
  throughDate: "2026-10-20",
  lines: [
    { lineItemId: "legal004sm1", daily: [{ date: "2026-10-05", conversions: 12, purchases: 2, leads: 10, revenue: 300 }] },
    { lineItemId: "legal004pd1", daily: [{ date: "2026-10-05", conversions: 5, purchases: 0, leads: 5, revenue: 0 }] },
  ],
}

const CHANNELS = [
  { group: "social_meta", lines: [{ lineItemId: "legal004sm1", spendToDate: 150 }] },
  { group: "programmatic_display", lines: [{ lineItemId: "legal004pd1", spendToDate: 1000 }] },
  { group: "programmatic_ooh", lines: [{ lineItemId: "legal004oh1", spendToDate: 4000 }] },
]

const WINDOW = { startISO: "2026-10-01", endISO: "2026-10-20", filtered: false, empty: false }

test("off: says so and carries no figures", () => {
  const block = deliveryConversionsBlock(CHANNELS, null)
  assert.equal(block.enabled, false)
})

test("on: headline is leads, per channel and line, ROAS on revenue-channel spend only", () => {
  const block = deliveryConversionsBlock(CHANNELS, LOADED)
  assert.equal(block.enabled, true)
  if (block.enabled !== true) return
  assert.equal(block.label, "Leads")
  assert.equal(block.total.count, 15)
  assert.equal(block.total.revenue, 300)
  assert.equal(block.total.roas, 2)
  assert.equal(block.total.spend, 1150)
  const meta = block.channels.find((c) => c.group === "social_meta")!
  assert.equal(meta.count, 10)
  assert.equal(meta.cpa, 15)
  const display = block.channels.find((c) => c.group === "programmatic_display")!
  assert.equal(display.revenue, null, "DV360 never carries revenue")
  assert.equal(display.roas, null)
  assert.equal(block.channels.some((c) => c.group === "programmatic_ooh"), false)
  assert.deepEqual(block.lines.map((l) => l.lineItemId).sort(), ["legal004pd1", "legal004sm1"])
})

test("read: passes the strip window and line ids; a failed read is unavailable, not zero", async () => {
  const calls: Parameters<LoadConversionsFn>[0][] = []
  const ok = await readDeliveryConversions({ mbaNumber: "legal004", channels: CHANNELS, window: WINDOW }, async (input) => {
    calls.push(input)
    return LOADED
  })
  assert.equal(ok.enabled, true)
  assert.equal(calls[0]!.startDate, "2026-10-01")
  assert.equal(calls[0]!.endDate, "2026-10-20")
  assert.equal(calls[0]!.skipRead, false)
  assert.deepEqual(calls[0]!.lineItemIds, ["legal004sm1", "legal004pd1", "legal004oh1"])

  const failed = await readDeliveryConversions({ mbaNumber: "legal004", channels: CHANNELS, window: WINDOW }, async () => {
    throw new Error("snowflake down")
  })
  assert.equal(failed.enabled, null)
})

test("read: a window that has not opened skips the Snowflake read", async () => {
  let skipRead: boolean | undefined
  await readDeliveryConversions(
    { mbaNumber: "legal004", channels: CHANNELS, window: { ...WINDOW, empty: true } },
    async (input) => {
      skipRead = input.skipRead
      return { ...LOADED, lines: [] }
    },
  )
  assert.equal(skipRead, true)
})
