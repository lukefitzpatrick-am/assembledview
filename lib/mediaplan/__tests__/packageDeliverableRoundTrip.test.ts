import assert from "node:assert/strict"
import test from "node:test"

import {
  deliverablesFromBudget,
  netMediaFromDeliverables,
} from "@/lib/mediaplan/deliverableBudget"
import { SEARCH_BUY_TYPE_OPTIONS } from "@/lib/mediaplan/expertGridChannelConfig"

test("Search buy-type options include package (newly enabled channel)", () => {
  assert.ok(
    SEARCH_BUY_TYPE_OPTIONS.some((o) => o.value === "package" && o.label === "Package")
  )
})

test("package deliverablesFromBudget / netMediaFromDeliverables round-trip (canonical derived)", () => {
  const unitRate = 250
  const netBudget = 5000
  const deliverables = deliverablesFromBudget("package", netBudget, unitRate)
  assert.equal(deliverables, 20)
  assert.equal(netMediaFromDeliverables("package", deliverables, unitRate), netBudget)
})
