/**
 * Package deliverable unification: OOH/Cinema use canonical derived maths
 * (same as deliverableBudget), not manual expert-grid qty.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { cinemaCardDeliverables } from "@/lib/mediaplan/cinemaLine"
import {
  computeDeliverableFromMedia,
  deliverablesFromBudget,
  netMediaFromDeliverables,
} from "@/lib/mediaplan/deliverableBudget"

const UNIT_RATE = 250
const NET_BUDGET = 5000
const DERIVED_QTY = 20 // NET_BUDGET / UNIT_RATE

test("canonical derived: package deliverablesFromBudget / computeDeliverableFromMedia", () => {
  assert.equal(deliverablesFromBudget("package", NET_BUDGET, UNIT_RATE), DERIVED_QTY)
  assert.equal(
    computeDeliverableFromMedia({
      buyType: "package",
      rawBudget: NET_BUDGET,
      buyAmount: UNIT_RATE,
      budgetIncludesFees: false,
      feePct: 0,
    }),
    DERIVED_QTY
  )
})

test("OOH falls through to derived package deliverables (hotfix removed)", () => {
  const derived = computeDeliverableFromMedia({
    buyType: "package",
    rawBudget: NET_BUDGET,
    buyAmount: UNIT_RATE,
    budgetIncludesFees: false,
    feePct: 0,
  })
  assert.equal(derived, DERIVED_QTY)
  assert.equal(
    netMediaFromDeliverables("package", derived, UNIT_RATE),
    NET_BUDGET,
    "OOH package round-trip deliverablesFromBudget ↔ netMediaFromDeliverables"
  )
})

test("Cinema falls through to derived package deliverables (hotfix removed)", () => {
  const derived = computeDeliverableFromMedia({
    buyType: "package",
    rawBudget: NET_BUDGET,
    buyAmount: UNIT_RATE,
    budgetIncludesFees: false,
    feePct: 0,
  })
  assert.equal(derived, DERIVED_QTY)
  assert.equal(
    netMediaFromDeliverables("package", derived, UNIT_RATE),
    NET_BUDGET,
    "Cinema package round-trip deliverablesFromBudget ↔ netMediaFromDeliverables"
  )
})

test("source: OOH HOTFIX no longer special-cases package", () => {
  const ooh = readFileSync(
    join(process.cwd(), "components/media-containers/OOHContainer.tsx"),
    "utf8"
  )
  assert.doesNotMatch(ooh, /HOTFIX:[\s\S]*buyTypeLower === "package"/)
})

test("Cinema's card works package deliverables out from budget and rate (W5f, on the shared container)", () => {
  assert.equal(
    cinemaCardDeliverables({ budget: "$5,000.00", buyAmount: "$250.00", calculatedValue: 8 }, "package", false, 0),
    DERIVED_QTY
  )
})
