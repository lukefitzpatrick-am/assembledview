/** S17: the queue's overdue rule and the digest's owner counts. */
import assert from "node:assert/strict"
import test from "node:test"

import { countByOwner, daysOpen, isOverdue, ruleLabel, type DataQualityItem } from "../rules.js"

const NOW = new Date("2026-11-24T10:00:00Z")

function item(over: Partial<DataQualityItem>): DataQualityItem {
  return {
    id: 1,
    ruleKey: "publish.no_publisher",
    mbaNumber: "AAA001",
    lineItemId: null,
    clientId: null,
    clientName: null,
    message: "m",
    fixLabel: "Open the plan",
    fixHref: "/mediaplans/mba/AAA001/edit",
    ownerEmail: null,
    ownerName: null,
    firstSeenAt: "2026-11-24T00:00:00Z",
    lastSeenAt: "2026-11-24T00:00:00Z",
    ...over,
  }
}

test("overdue means open more than 3 whole days", () => {
  assert.equal(daysOpen("2026-11-24T09:00:00Z", NOW), 0)
  assert.equal(daysOpen("2026-11-30T09:00:00Z", NOW), 0)
  assert.equal(isOverdue(item({ firstSeenAt: "2026-11-21T10:00:00Z" }), NOW), false)
  assert.equal(isOverdue(item({ firstSeenAt: "2026-11-20T10:00:01Z" }), NOW), false)
  assert.equal(isOverdue(item({ firstSeenAt: "2026-11-20T10:00:00Z" }), NOW), true)
})

test("owners: most overdue first, then most open, then name; unassigned is one owner", () => {
  const old = "2026-11-01T00:00:00Z"
  const rows = countByOwner(
    [
      item({ ownerEmail: "b@x", ownerName: "Bea" }),
      item({ ownerEmail: "b@x", ownerName: "Bea" }),
      item({ ownerEmail: "a@x", ownerName: "Al" }),
      item({ ownerEmail: "a@x", ownerName: "Al" }),
      item({ ownerEmail: null, firstSeenAt: old }),
      item({ ownerEmail: null }),
      item({ ownerEmail: "c@x", ownerName: "Cy", firstSeenAt: old }),
    ],
    NOW,
  )
  assert.deepEqual(
    rows.map((r) => `${r.ownerName ?? r.ownerEmail ?? "Unassigned"} ${r.overdue}/${r.open}`),
    ["Unassigned 1/2", "Cy 1/1", "Al 0/2", "Bea 0/2"],
  )
})

test("an unknown rule key shows as itself", () => {
  assert.equal(ruleLabel("publish.no_publisher"), "Line has no publisher")
  assert.equal(ruleLabel("later.rule"), "later.rule")
})
