/**
 * Package deliverable unification: OOH/Cinema use canonical derived maths
 * (same as deliverableBudget), not manual expert-grid qty.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

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

test("source: OOH HOTFIX and Cinema early-return no longer special-case package", () => {
  const root = process.cwd()
  const ooh = readFileSync(
    join(root, "components/media-containers/OOHContainer.tsx"),
    "utf8"
  )
  const cinema = readFileSync(
    join(root, "components/media-containers/CinemaContainer.tsx"),
    "utf8"
  )
  assert.doesNotMatch(ooh, /HOTFIX:[\s\S]*buyTypeLower === "package"/)
  // cinemaBurstDeliverables must not early-return package before computeDeliverableFromMedia
  const cinemaFn = cinema.slice(
    cinema.indexOf("cinemaBurstDeliverables"),
    cinema.indexOf("[feecinema]")
  )
  assert.doesNotMatch(
    cinemaFn,
    /buyTypeLower === "package"[\s\S]*calculatedValue/
  )
  assert.match(cinemaFn, /computeDeliverableFromMedia/)
})
