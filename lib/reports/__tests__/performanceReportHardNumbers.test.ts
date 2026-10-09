import assert from "node:assert/strict"
import test from "node:test"

import { findInventedMoneyInNarrative } from "../performanceReportHardNumbers.js"

test("findInventedMoneyInNarrative rejects free-text $ figures", () => {
  const hit = findInventedMoneyInNarrative({
    execSummary: "Spend is on track this month.",
    channels: ["Search leads efficiency."],
    keyInsight: "Shift budget toward branded search.",
    insights: ["Frequency is elevated on Meta."],
    recsInFlight: "Move $12k from social to search.",
    recsNextPeriod: "Refresh prospecting.",
    steps: [{ when: "This week", what: "Approve shift" }],
  })
  assert.ok(hit)
  assert.equal(hit!.field, "recsInFlight")
  assert.match(hit!.match, /\$\s*12k/i)
})

test("findInventedMoneyInNarrative allows a figure that is already in the input", () => {
  const hit = findInventedMoneyInNarrative(
    { outcome: "Search delivered $18,450 of spend, 54% of the plan." },
    "spend 18450 planned share 54%",
  )
  assert.equal(hit, null)
})

test("findInventedMoneyInNarrative rejects a percent that is not in the input", () => {
  const hit = findInventedMoneyInNarrative(
    { outcome: "Search delivered 54% of spend." },
    "spend 18450",
  )
  assert.ok(hit)
  assert.match(hit!.match, /54\s*%/)
})

test("findInventedMoneyInNarrative allows narrative without money", () => {
  const hit = findInventedMoneyInNarrative({
    execSummary: "Delivery is on track; search leads efficiency.",
    channels: ["Search ahead on pace.", "Social slight underspend.", "Prog on track.", "BVOD catching up."],
    keyInsight: "Efficiency gains concentrated in branded search.",
    insights: ["Branded search CPA improved MoM.", "Meta frequency elevated.", "BVOD lag is flighting."],
    recsInFlight: "Shift social budget into search; pause fatigued creative.",
    recsNextPeriod: "Launch new prospecting; bring BVOD back to plan.",
    steps: [{ when: "This week", what: "Approve budget shift" }],
  })
  assert.equal(hit, null)
})
