/**
 * Live Partial MBA POST body — hydration/empty guards, excluded lines, months.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { deriveLiveMbaScopeSelection } from "../liveMbaScopeSelection.js"

const LINE_A = { lineItemId: "billing-search::SE1", approval: "approved" as const }
const LINE_B = { lineItemId: "billing-search::SE2", approval: "excluded" as const }
const LINE_C = { lineItemId: "billing-prog::PD1", approval: "approved" as const }

test("returns null when channels are not hydrated", () => {
  const result = deriveLiveMbaScopeSelection({
    allChannelsHydrated: false,
    lineItems: [LINE_A, LINE_B],
    selectedMonthYears: ["August 2026"],
  })
  assert.equal(result, null)
})

test("drops excluded lines from approvedLineItemIds", () => {
  const result = deriveLiveMbaScopeSelection({
    allChannelsHydrated: true,
    lineItems: [LINE_A, LINE_B, LINE_C],
    selectedMonthYears: [],
  })
  assert.deepEqual(result, {
    approvedLineItemIds: ["billing-search::SE1", "billing-prog::PD1"],
  })
})

test("returns null when every line is excluded", () => {
  const result = deriveLiveMbaScopeSelection({
    allChannelsHydrated: true,
    lineItems: [LINE_B, { lineItemId: "billing-tv::TV1", approval: "excluded" }],
    selectedMonthYears: ["August 2026"],
  })
  assert.equal(result, null)
})

test("includes selectedMonthYears only when non-empty", () => {
  const withMonths = deriveLiveMbaScopeSelection({
    allChannelsHydrated: true,
    lineItems: [LINE_A],
    selectedMonthYears: ["August 2026", "September 2026"],
  })
  assert.deepEqual(withMonths, {
    approvedLineItemIds: ["billing-search::SE1"],
    selectedMonthYears: ["August 2026", "September 2026"],
  })

  const withoutMonths = deriveLiveMbaScopeSelection({
    allChannelsHydrated: true,
    lineItems: [LINE_A],
    selectedMonthYears: [],
  })
  assert.deepEqual(withoutMonths, {
    approvedLineItemIds: ["billing-search::SE1"],
  })
  assert.equal(
    Object.prototype.hasOwnProperty.call(withoutMonths, "selectedMonthYears"),
    false
  )
})
