import assert from "node:assert/strict"
import test from "node:test"

import { includeProgrammaticRowInOverview } from "../mapOverviewItems"
import { mapDirectLineToOverviewItem } from "../mapOverviewItems"

test("fixed-cost programmatic Channel Factory line is keyed once under direct", () => {
  const programmatic = [
    { mbaNumber: "bicau002", lineItemId: "bicau002pv1", fixedCostMedia: true },
    { mbaNumber: "bicau002", lineItemId: "bicau002pd1", fixedCostMedia: false },
  ]
  const progIds = programmatic
    .filter(includeProgrammaticRowInOverview)
    .map((row) => `programmatic:${row.mbaNumber}:${row.lineItemId}`)
  const direct = mapDirectLineToOverviewItem({
    clientName: "BIC",
    campaignName: "Always on",
    mbaNumber: "bicau002",
    lineItemId: "bicau002pv1",
    lineItemName: "Channel Factory",
    lineItemStatus: "in_progress",
    bookedCost: 100,
    spentCost: 40,
  })
  const ids = [...progIds, direct.id].toSorted()
  assert.deepEqual(ids, [
    "direct:bicau002:bicau002pv1",
    "programmatic:bicau002:bicau002pd1",
  ])
})

test("fixed-cost programmatic OOH line is keyed once under direct, not programmatic", () => {
  const programmatic = [
    { mbaNumber: "legal004", lineItemId: "legal004po1", fixedCostMedia: true },
    { mbaNumber: "legal004", lineItemId: "legal004po2", fixedCostMedia: false },
  ]
  const progIds = programmatic
    .filter(includeProgrammaticRowInOverview)
    .map((row) => `programmatic:${row.mbaNumber}:${row.lineItemId}`)
  const direct = mapDirectLineToOverviewItem({
    clientName: "Legal Super",
    campaignName: "OOH",
    mbaNumber: "legal004",
    lineItemId: "legal004po1",
    lineItemName: "Vistar",
    lineItemStatus: "in_progress",
    bookedCost: 100,
    spentCost: 40,
  })
  const ids = [...progIds, direct.id].toSorted()
  assert.deepEqual(ids, [
    "direct:legal004:legal004po1",
    "programmatic:legal004:legal004po2",
  ])
  assert.equal(ids.filter((id) => id.includes("legal004po1")).length, 1)
})
