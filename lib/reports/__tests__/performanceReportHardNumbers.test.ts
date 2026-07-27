import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPerformanceReportHardNumbers,
  findInventedMoneyInNarrative,
  plannedToDateFromPageContext,
} from "../performanceReportHardNumbers.js"

test("buildPerformanceReportHardNumbers injects delivered vs planned pace", () => {
  const hard = buildPerformanceReportHardNumbers({
    totals: {
      spendToDate: 96_000,
      impressions: 1_200_000,
      clicks: 24_000,
      results: 480,
      video3sViews: 0,
      plannedBudget: 200_000,
      cpm: 8,
      ctr: 0.02,
      cpc: 4,
    },
    plannedToDate: 100_000,
  })

  assert.match(hard.deliverySpend, /\$96,000\.00/)
  assert.match(hard.deliverySpend, /\$100,000\.00/)
  assert.match(hard.deliverySpend, /96\.0%/)
  assert.match(hard.deliveryDeliverables, /1,200,000 impressions/)
  assert.match(hard.deliveryDeliverables, /24,000 clicks/)
  assert.equal(hard.kpis.length, 4)
  assert.match(hard.kpis[0]!, /CPM/)
  assert.match(hard.kpis[1]!, /CTR 2\.00%/)
  assert.equal(hard.reconciled.deliveredSpend, 96_000)
  assert.equal(hard.reconciled.plannedToDate, 100_000)
  assert.ok(hard.reconciled.pacePct != null && Math.abs(hard.reconciled.pacePct - 96) < 0.01)
})

test("buildPerformanceReportHardNumbers shows Not available when snapshot has no delivery", () => {
  const hard = buildPerformanceReportHardNumbers({
    totals: {
      spendToDate: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      video3sViews: 0,
      plannedBudget: null,
      cpm: null,
      ctr: null,
      cpc: null,
    },
    plannedToDate: 50_000,
  })

  assert.match(hard.deliverySpend, /Not available/)
  assert.doesNotMatch(hard.deliverySpend, /\$0\.00/)
  assert.match(hard.kpis[3]!, /Not available/)
  assert.equal(hard.reconciled.deliveredSpend, 0)
  assert.equal(hard.reconciled.pacePct, null)
})

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

test("plannedToDateFromPageContext reads page state", () => {
  assert.equal(
    plannedToDateFromPageContext({
      state: { spend: { plannedToDate: 55_000 } },
    }),
    55_000,
  )
  assert.equal(plannedToDateFromPageContext({}), null)
})
