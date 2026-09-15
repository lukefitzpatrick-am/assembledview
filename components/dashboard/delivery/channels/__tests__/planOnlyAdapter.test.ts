import assert from "node:assert/strict"
import test from "node:test"

import { buildPlanOnlyRemainderSection } from "../planOnlyAdapter"

test("classified Reddit with no delivery rows shows planned budget and No delivery data yet", () => {
  const section = buildPlanOnlyRemainderSection({
    lineItems: [
      {
        line_item_id: "bicau006sm1",
        platform: "Reddit",
        creative_targeting: "Prospecting",
        bursts: [{ start_date: "2026-03-01", end_date: "2026-03-31", budget_number: 12_500 }],
      },
    ],
    campaignStart: "2026-03-01",
    campaignEnd: "2026-03-31",
    lastSyncedAt: null,
  })
  assert.ok(section)
  assert.equal(section.key, "plan-only")
  assert.equal(section.title, "Awaiting delivery")
  assert.equal(section.connections.length, 0)
  assert.equal(section.lineItems.length, 1)
  const spend = section.lineItems[0]?.block.progressCards[0]
  assert.equal(spend?.status, "no-data")
  assert.equal(spend?.detail, "No delivery data yet")
  assert.match(String(spend?.value), /12,500/)
  assert.equal(section.lineItems[0]?.block.progressCards[1]?.detail, "No delivery data yet")
  assert.deepEqual(section.aggregate.kpiBand.tiles, [])
})

test("empty remainder returns null", () => {
  assert.equal(
    buildPlanOnlyRemainderSection({
      lineItems: [],
      campaignStart: "2026-03-01",
      campaignEnd: "2026-03-31",
      lastSyncedAt: null,
    }),
    null,
  )
})
