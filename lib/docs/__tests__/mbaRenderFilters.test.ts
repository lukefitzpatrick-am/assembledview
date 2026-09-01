/**
 * Live Partial MBA render filters — month labels, canonical ids, live overlay.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { ScheduleMonthRowInput } from "@/lib/finance/scheduleMonthsSource.js"
import {
  renderMonthKey,
  resolveMbaRenderFilters,
  rowInApprovedSlice,
  sumBillingComponentsFromRows,
} from "../mbaRenderFilters.js"

function row(
  partial: Pick<
    ScheduleMonthRowInput,
    "lineItemId" | "component" | "basis" | "month" | "amountCents"
  > &
    Partial<ScheduleMonthRowInput>
): ScheduleMonthRowInput {
  return {
    versionId: 1,
    source: "computed",
    ...partial,
  }
}

const FROZEN = {
  lines: [
    {
      lineItemId: "SE1",
      months: ["2026-08", "2026-09"],
      mediaCents: 20_000_00,
      feeCents: 0,
      adservingCents: 0,
      productionCents: 0,
    },
    {
      lineItemId: "PD1",
      months: ["2026-08", "2026-09"],
      mediaCents: 10_000_00,
      feeCents: 0,
      adservingCents: 0,
      productionCents: 0,
    },
  ],
}

test("August 2026 matches 2026-08-01", () => {
  assert.equal(renderMonthKey("August 2026"), "2026-08")
  assert.equal(renderMonthKey("2026-08-01"), "2026-08")
  assert.equal(renderMonthKey("2026-08"), "2026-08")
  const ok = rowInApprovedSlice(
    { lineItemId: "SE1", month: "2026-08-01" },
    new Set(["SE1"]),
    new Set([renderMonthKey("August 2026")])
  )
  assert.equal(ok, true)
})

test("prefixed id matches bare id", () => {
  const filters = resolveMbaRenderFilters({
    frozenSlice: FROZEN,
    liveSelection: { approvedLineItemIds: ["billing-search::SE1"] },
  })
  assert.equal(filters.restrictLineIds, true)
  assert.equal(filters.liveOverlay, true)
  assert.equal(
    rowInApprovedSlice(
      { lineItemId: "SE1", month: "2026-08-01" },
      filters.approvedIds,
      filters.approvedMonths,
      filters.restrictLineIds
    ),
    true
  )
  assert.equal(
    rowInApprovedSlice(
      { lineItemId: "billing-search::SE1", month: "2026-08-01" },
      filters.approvedIds,
      filters.approvedMonths,
      filters.restrictLineIds
    ),
    true
  )
  assert.equal(
    rowInApprovedSlice(
      { lineItemId: "PD1", month: "2026-08-01" },
      filters.approvedIds,
      filters.approvedMonths,
      filters.restrictLineIds
    ),
    false
  )
})

test("live month subset drops other months' cents", () => {
  const scheduleRows = [
    row({
      lineItemId: "SE1",
      component: "media",
      basis: "billing",
      month: "2026-08-01",
      amountCents: 8_000_00,
    }),
    row({
      lineItemId: "SE1",
      component: "media",
      basis: "billing",
      month: "2026-09-01",
      amountCents: 12_000_00,
    }),
    row({
      lineItemId: "SE1",
      component: "fee",
      basis: "billing",
      month: "2026-08-01",
      amountCents: 1_600_00,
    }),
    row({
      lineItemId: "SE1",
      component: "fee",
      basis: "billing",
      month: "2026-09-01",
      amountCents: 2_400_00,
    }),
  ]
  const filters = resolveMbaRenderFilters({
    frozenSlice: FROZEN,
    liveSelection: { selectedMonthYears: ["August 2026"] },
  })
  const sums = sumBillingComponentsFromRows(scheduleRows, filters)
  assert.equal(sums.mediaCents, 8_000_00)
  assert.equal(sums.feeCents, 1_600_00)
})

test("empty selectedMonthYears does not overlay — frozen months stay", () => {
  const filters = resolveMbaRenderFilters({
    frozenSlice: FROZEN,
    liveSelection: { selectedMonthYears: [] },
  })
  assert.equal(filters.liveOverlay, false)
  assert.equal(filters.approvedMonths?.has("2026-08"), true)
  assert.equal(filters.approvedMonths?.has("2026-09"), true)
})

test("live empty approvedLineItemIds yields zero billed media", () => {
  const scheduleRows = [
    row({
      lineItemId: "billing-search::SE1",
      component: "media",
      basis: "billing",
      month: "2026-08-01",
      amountCents: 8_000_00,
    }),
    row({
      lineItemId: "PD1",
      component: "media",
      basis: "billing",
      month: "2026-08-01",
      amountCents: 5_000_00,
    }),
  ]
  const filters = resolveMbaRenderFilters({
    frozenSlice: FROZEN,
    liveSelection: { approvedLineItemIds: [] },
  })
  assert.equal(filters.restrictLineIds, true)
  const sums = sumBillingComponentsFromRows(scheduleRows, filters)
  assert.equal(sums.mediaCents, 0)
})
