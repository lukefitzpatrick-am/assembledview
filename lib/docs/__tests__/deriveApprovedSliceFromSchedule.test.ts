/**
 * HF6 — derive approved_slice from billing schedule_months at render time.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { ScheduleMonthRowInput } from "@/lib/finance/scheduleMonthsSource.js"
import { deriveApprovedSliceFromScheduleRows } from "../deriveApprovedSliceFromSchedule.js"

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

test("__service__production is excluded from the derived slice", () => {
  const slice = deriveApprovedSliceFromScheduleRows([
    row({
      lineItemId: "__service__production",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 50_000_00,
    }),
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
  ])
  assert.ok(slice)
  assert.equal(slice.lines.some((l) => l.lineItemId.startsWith("__service__")), false)
  assert.equal(slice.totalCents, 10_000_00)
  assert.equal(slice.lines.length, 1)
  assert.equal(slice.lines[0]!.mediaCents, 10_000_00)
})

test("PROD line lands in productionCents, not mediaCents", () => {
  const slice = deriveApprovedSliceFromScheduleRows([
    row({
      lineItemId: "hartm013PROD1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 12_000_00,
    }),
  ])
  assert.ok(slice)
  assert.equal(slice.lines.length, 1)
  assert.equal(slice.lines[0]!.productionCents, 12_000_00)
  assert.equal(slice.lines[0]!.mediaCents, 0)
  assert.equal(slice.totalCents, 12_000_00)
})

test("fee and adserving components map to their own buckets", () => {
  const slice = deriveApprovedSliceFromScheduleRows([
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "fee",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 1_500_00,
    }),
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "adserving",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 250_00,
    }),
  ])
  assert.ok(slice)
  assert.equal(slice.lines.length, 1)
  const line = slice.lines[0]!
  assert.equal(line.feeCents, 1_500_00)
  assert.equal(line.adservingCents, 250_00)
  assert.equal(line.mediaCents, 0)
  assert.equal(line.productionCents, 0)
  assert.deepEqual(line.months, ["2026-05"])
})

test("delivery-basis rows are ignored", () => {
  const slice = deriveApprovedSliceFromScheduleRows([
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 8_000_00,
    }),
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "media",
      basis: "delivery",
      month: "2026-05-01",
      amountCents: 99_000_00,
    }),
  ])
  assert.ok(slice)
  assert.equal(slice.totalCents, 8_000_00)
  assert.equal(slice.lines[0]!.mediaCents, 8_000_00)
})

test("unapproved line ids are excluded", () => {
  const slice = deriveApprovedSliceFromScheduleRows(
    [
      row({
        lineItemId: "billing-search::demo001SE1",
        component: "media",
        basis: "billing",
        month: "2026-05-01",
        amountCents: 8_000_00,
      }),
      row({
        lineItemId: "billing-progDisplay::demo001PD1",
        component: "media",
        basis: "billing",
        month: "2026-05-01",
        amountCents: 3_000_00,
      }),
    ],
    { unapprovedLineIds: new Set(["demo001SE1"]) }
  )
  assert.ok(slice)
  assert.equal(slice.lines.length, 1)
  assert.equal(slice.lines[0]!.lineItemId, "billing-progDisplay::demo001PD1")
  assert.equal(slice.totalCents, 3_000_00)
})

test("returns null when there are no billing rows", () => {
  assert.equal(deriveApprovedSliceFromScheduleRows([]), null)
  assert.equal(
    deriveApprovedSliceFromScheduleRows([
      row({
        lineItemId: "billing-search::demo001SE1",
        component: "media",
        basis: "delivery",
        month: "2026-05-01",
        amountCents: 8_000_00,
      }),
    ]),
    null
  )
})

test("totalCents equals the sum of all four buckets", () => {
  const slice = deriveApprovedSliceFromScheduleRows([
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 10_000_00,
    }),
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "fee",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 1_000_00,
    }),
    row({
      lineItemId: "billing-search::demo001SE1",
      component: "adserving",
      basis: "billing",
      month: "2026-06-01",
      amountCents: 200_00,
    }),
    row({
      lineItemId: "hartm013PROD1",
      component: "media",
      basis: "billing",
      month: "2026-05-01",
      amountCents: 5_000_00,
    }),
  ])
  assert.ok(slice)
  const bucketSum = slice.lines.reduce(
    (s, l) => s + l.mediaCents + l.feeCents + l.adservingCents + l.productionCents,
    0
  )
  assert.equal(slice.totalCents, bucketSum)
  assert.equal(slice.totalCents, 16_200_00)
})
