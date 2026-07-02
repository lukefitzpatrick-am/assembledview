import assert from "node:assert/strict"
import test from "node:test"

import { mergeInvestmentMonths } from "../mergeInvestmentMonths.js"

test("merges overlapping months across two channels", () => {
  const merged = mergeInvestmentMonths({
    radio: [
      { monthYear: "January 2026", amount: "$1,000.00" },
      { monthYear: "February 2026", amount: "$500.00" },
    ],
    television: [
      { monthYear: "January 2026", amount: "$2,000.00" },
      { monthYear: "March 2026", amount: "$750.00" },
    ],
  })

  assert.deepEqual(merged, [
    { monthYear: "January 2026", amount: "$3,000.00" },
    { monthYear: "February 2026", amount: "$500.00" },
    { monthYear: "March 2026", amount: "$750.00" },
  ])
})

test("empty channel rows remove that channel's contribution", () => {
  const withRadio = mergeInvestmentMonths({
    radio: [{ monthYear: "January 2026", amount: "$1,000.00" }],
    television: [{ monthYear: "January 2026", amount: "$2,000.00" }],
  })

  assert.deepEqual(withRadio, [
    { monthYear: "January 2026", amount: "$3,000.00" },
  ])

  const withoutRadio = mergeInvestmentMonths({
    radio: [],
    television: [{ monthYear: "January 2026", amount: "$2,000.00" }],
  })

  assert.deepEqual(withoutRadio, [
    { monthYear: "January 2026", amount: "$2,000.00" },
  ])
})

test("returns empty array when all channels are empty", () => {
  assert.deepEqual(mergeInvestmentMonths({ radio: [], television: [] }), [])
  assert.deepEqual(mergeInvestmentMonths({}), [])
})
