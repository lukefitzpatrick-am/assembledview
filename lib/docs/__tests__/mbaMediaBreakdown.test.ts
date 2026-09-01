/**
 * MBA media breakdown: billed slice + client-paid delivery-only lines.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi.js"
import type { ScheduleMonthRowInput } from "@/lib/finance/scheduleMonthsSource.js"
import { computeMbaMediaBreakdown } from "../buildMbaFromPersisted.js"

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

test("billed-only plan: grossMediaByType matches billing media rows; clientPaidCents 0", () => {
  const scheduleRows = [
    row({
      lineItemId: "billing-search::SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
    row({
      lineItemId: "billing-progDisplay::PD1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 5_000_00,
    }),
    row({
      lineItemId: "billing-search::SE1",
      component: "fee",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 2_000_00,
    }),
    row({
      lineItemId: "billing-search::SE1",
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
  ]
  const approvedIds = new Set(["billing-search::SE1", "billing-progDisplay::PD1"])
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds,
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(),
  })
  assert.equal(result.clientPaidCents, 0)
  assert.equal(result.billedMediaCents, 15_000_00)
  assert.equal(result.grossMediaByType.get("search"), 10_000_00)
  assert.equal(result.grossMediaByType.get("progDisplay"), 5_000_00)
  assert.equal(result.grossMediaByType.size, 2)
})

test("delivery-only line appears under its media type as client-paid", () => {
  const scheduleRows = [
    row({
      lineItemId: "billing-search::SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
    row({
      lineItemId: "hartm001PD3",
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 4_000_00,
    }),
  ]
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds: new Set(["billing-search::SE1"]),
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(),
  })
  assert.equal(result.billedMediaCents, 10_000_00)
  assert.equal(result.clientPaidCents, 4_000_00)
  assert.equal(result.grossMediaByType.get("search"), 10_000_00)
  assert.equal(result.grossMediaByType.get("progDisplay"), 4_000_00)
})

test("decorated billing id + bare delivery id of the same line is not client-paid", () => {
  const decorated = "billing-progDisplay::BOSS001PD001"
  const bare = "BOSS001PD001"
  assert.equal(toBillingOverrideLineItemId(decorated), bare)
  const scheduleRows = [
    row({
      lineItemId: decorated,
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 5_000_00,
    }),
    row({
      lineItemId: bare,
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 5_000_00,
    }),
  ]
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds: new Set([decorated]),
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(),
  })
  assert.equal(result.clientPaidCents, 0)
  assert.equal(result.billedMediaCents, 5_000_00)
  assert.equal(result.grossMediaByType.get("progDisplay"), 5_000_00)
  assert.equal(result.grossMediaByType.size, 1)
})

test("delivery-only line in unapprovedLineIds is excluded entirely", () => {
  const scheduleRows = [
    row({
      lineItemId: "billing-search::SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
    row({
      lineItemId: "billing-socialMedia::SOC1",
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 3_000_00,
    }),
  ]
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds: new Set(["billing-search::SE1"]),
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(["SOC1"]),
  })
  assert.equal(result.clientPaidCents, 0)
  assert.equal(result.billedMediaCents, 10_000_00)
  assert.equal(result.grossMediaByType.has("socialMedia"), false)
})

test("approvedMonths excludes out-of-scope client-paid months", () => {
  const scheduleRows = [
    row({
      lineItemId: "hartm001PD3",
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 3_000_00,
    }),
    row({
      lineItemId: "hartm001PD3",
      component: "media",
      basis: "delivery",
      month: "2026-07-01",
      amountCents: 2_000_00,
    }),
  ]
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds: new Set(),
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(),
  })
  assert.equal(result.billedMediaCents, 0)
  assert.equal(result.clientPaidCents, 3_000_00)
  assert.equal(result.grossMediaByType.get("progDisplay"), 3_000_00)
})

test("canonical match: prefixed approvedIds include bare schedule rows", () => {
  const scheduleRows = [
    row({
      lineItemId: "SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
    row({
      lineItemId: "PD1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 5_000_00,
    }),
  ]
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds: new Set(["billing-search::SE1"]),
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(),
  })
  assert.equal(result.billedMediaCents, 10_000_00)
  assert.equal(result.grossMediaByType.get("search"), 10_000_00)
  assert.equal(result.grossMediaByType.has("progDisplay"), false)
})

test("restrictLineIds empty approvedIds yields zero billed media", () => {
  const scheduleRows = [
    row({
      lineItemId: "billing-search::SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
  ]
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds: new Set(),
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(),
    restrictLineIds: true,
  })
  assert.equal(result.billedMediaCents, 0)
  assert.equal(result.grossMediaByType.size, 0)
})

test("production and __service__ delivery rows are never client-paid", () => {
  const scheduleRows = [
    row({
      lineItemId: "hartm013PROD1",
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 8_000_00,
    }),
    row({
      lineItemId: "__service__adserving",
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 500_00,
    }),
    row({
      lineItemId: "__service__fees",
      component: "fee",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 1_000_00,
    }),
  ]
  const result = computeMbaMediaBreakdown({
    scheduleRows,
    approvedIds: new Set(),
    approvedMonths: new Set(["2026-05"]),
    unapprovedLineIds: new Set(),
  })
  assert.equal(result.clientPaidCents, 0)
  assert.equal(result.billedMediaCents, 0)
  assert.equal(result.grossMediaByType.size, 0)
})
