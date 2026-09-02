import assert from "node:assert/strict"
import test from "node:test"

import { STUB_PLANNING_CHANNELS } from "./planningDimStub.js"
import {
  groupUncoveredLeaves,
  isFilteredRmRun,
} from "../coverageHonesty.js"

test("isFilteredRmRun is false for All cases and empty", () => {
  assert.equal(isFilteredRmRun(null), false)
  assert.equal(isFilteredRmRun(""), false)
  assert.equal(isFilteredRmRun("All cases"), false)
  assert.equal(isFilteredRmRun("  all cases  "), false)
})

test("isFilteredRmRun is true for a non-national filter", () => {
  assert.equal(isFilteredRmRun("Grocery buyers"), true)
})

test("groupUncoveredLeaves groups by LEVEL1 and offers inherit only when rollup is covered", () => {
  const uncovered = ["ooh_street", "facebook", "instagram"]
  const covered = new Set(["ooh_total"])
  const groups = groupUncoveredLeaves({
    uncoveredLeafIds: uncovered,
    channels: STUB_PLANNING_CHANNELS,
    coveredIds: covered,
  })
  const outdoor = groups.find((g) => g.level1 === "Outdoor")
  const social = groups.find((g) => g.level1 === "Social")
  assert.ok(outdoor)
  assert.equal(outdoor!.rollupCovered, true)
  assert.equal(outdoor!.rollup?.channel_id, "ooh_total")
  assert.equal(outdoor!.leaves.length, 1)
  assert.ok(social)
  assert.equal(social!.rollupCovered, false)
  assert.equal(social!.leaves.length, 2)
})
