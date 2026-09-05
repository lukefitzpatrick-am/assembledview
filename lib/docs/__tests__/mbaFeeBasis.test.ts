/**
 * Historic published cuts with no fee snapshot, no fee schedule rows, and no
 * approved_slice must refuse a $0 MBA fee — not render it.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import type { ScheduleMonthRowInput } from "@/lib/finance/scheduleMonthsSource.js"
import { centsToDollars } from "@/lib/finance/scheduleMonthsSource.js"
import {
  PersistedDocError,
  assertPersistedMbaFeeBasis,
  computeMbaMediaBreakdown,
} from "../buildMbaFromPersisted.js"
import { deriveApprovedSliceFromScheduleRows } from "../deriveApprovedSliceFromSchedule.js"

const here = dirname(fileURLToPath(import.meta.url))
const penfold = JSON.parse(
  readFileSync(join(here, "fixtures/penfold001-v16.plan.json"), "utf8"),
) as {
  master: { mbaNumber: string }
  version: {
    id: number
    versionNumber: number
    approvedSlice?: unknown
  }
  feeSnapshot: Record<string, unknown>
}

function row(
  partial: Pick<
    ScheduleMonthRowInput,
    "lineItemId" | "component" | "basis" | "month" | "amountCents"
  >,
): ScheduleMonthRowInput {
  return {
    versionId: penfold.version.id,
    source: "computed",
    ...partial,
  }
}

/** PENFOLD001 v16 shape: billing and delivery media both $30,000; no fee rows. */
function penfold001ShapedScheduleRows(): ScheduleMonthRowInput[] {
  return [
    row({
      lineItemId: "PENFOLD001NP1",
      component: "media",
      basis: "billing",
      month: "2026-01-01",
      amountCents: 1_500_00,
    }),
    row({
      lineItemId: "PENFOLD001NP2",
      component: "media",
      basis: "billing",
      month: "2026-01-01",
      amountCents: 1_500_00,
    }),
    row({
      lineItemId: "PENFOLD001ML1",
      component: "media",
      basis: "billing",
      month: "2026-02-01",
      amountCents: 20_000_00,
    }),
    row({
      lineItemId: "PENFOLD001BV1",
      component: "media",
      basis: "billing",
      month: "2026-02-01",
      amountCents: 7_000_00,
    }),
    row({
      lineItemId: "PENFOLD001NP1",
      component: "media",
      basis: "delivery",
      month: "2026-01-01",
      amountCents: 1_500_00,
    }),
    row({
      lineItemId: "PENFOLD001NP2",
      component: "media",
      basis: "delivery",
      month: "2026-01-01",
      amountCents: 1_500_00,
    }),
    row({
      lineItemId: "PENFOLD001ML1",
      component: "media",
      basis: "delivery",
      month: "2026-02-01",
      amountCents: 20_000_00,
    }),
    row({
      lineItemId: "PENFOLD001BV1",
      component: "media",
      basis: "delivery",
      month: "2026-02-01",
      amountCents: 7_000_00,
    }),
  ]
}

describe("assertPersistedMbaFeeBasis PENFOLD001-shaped historic cut", () => {
  it("throws NO_FEE_BASIS when there is no snapshot row, no fee schedule rows, and approved_slice is null", () => {
    assert.equal(penfold.master.mbaNumber, "PENFOLD001")
    assert.equal(penfold.version.versionNumber, 16)
    assert.deepEqual(penfold.feeSnapshot, {})
    assert.equal(penfold.version.approvedSlice ?? null, null)

    const scheduleRows = penfold001ShapedScheduleRows()
    assert.equal(
      scheduleRows.some((r) => r.component === "fee"),
      false,
    )

    assert.throws(
      () =>
        assertPersistedMbaFeeBasis({
          hasFeeSnapshotRow: false,
          scheduleRows,
          approvedSlice: null,
        }),
      (err: unknown) =>
        err instanceof PersistedDocError &&
        err.code === "NO_FEE_BASIS" &&
        /published before fee snapshots/i.test(err.message) &&
        /use the saved document/i.test(err.message),
    )
  })

  it("does not throw when an mba_fee_snapshots row exists", () => {
    assert.doesNotThrow(() =>
      assertPersistedMbaFeeBasis({
        hasFeeSnapshotRow: true,
        scheduleRows: penfold001ShapedScheduleRows(),
        approvedSlice: null,
      }),
    )
  })

  it("does not throw when schedule_months has component=fee rows", () => {
    assert.doesNotThrow(() =>
      assertPersistedMbaFeeBasis({
        hasFeeSnapshotRow: false,
        scheduleRows: [
          ...penfold001ShapedScheduleRows(),
          row({
            lineItemId: "PENFOLD001NP1",
            component: "fee",
            basis: "billing",
            month: "2026-01-01",
            amountCents: 15_00,
          }),
        ],
        approvedSlice: null,
      }),
    )
  })

  it("does not throw when approved_slice is present", () => {
    assert.doesNotThrow(() =>
      assertPersistedMbaFeeBasis({
        hasFeeSnapshotRow: false,
        scheduleRows: penfold001ShapedScheduleRows(),
        approvedSlice: { totalCents: 30_000_00, lines: [] },
      }),
    )
  })
})

describe("PENFOLD001 v16 derived-slice gross (39375 probe)", () => {
  it("aligned line ids stay at $30,000 billed; 39,375 is unmatched delivery OOH bursts, not fee", () => {
    const scheduleRows = penfold001ShapedScheduleRows()
    const billingMedia = scheduleRows
      .filter((r) => r.basis === "billing" && r.component === "media")
      .reduce((s, r) => s + r.amountCents, 0)
    const deliveryMedia = scheduleRows
      .filter((r) => r.basis === "delivery" && r.component === "media")
      .reduce((s, r) => s + r.amountCents, 0)
    assert.equal(centsToDollars(billingMedia), 30_000)
    assert.equal(centsToDollars(deliveryMedia), 30_000)

    const slice = deriveApprovedSliceFromScheduleRows(scheduleRows)
    assert.ok(slice)
    assert.equal(centsToDollars(slice.totalCents), 30_000)
    assert.equal(
      slice.lines.reduce((s, l) => s + l.feeCents, 0),
      0,
    )

    const breakdown = computeMbaMediaBreakdown({
      scheduleRows,
      approvedIds: new Set(slice.lines.map((l) => l.lineItemId)),
      approvedMonths: null,
      unapprovedLineIds: new Set(),
    })
    assert.equal(centsToDollars(breakdown.billedMediaCents), 30_000)
    assert.equal(centsToDollars(breakdown.clientPaidCents), 0)
    assert.equal(
      centsToDollars(breakdown.billedMediaCents + breakdown.clientPaidCents),
      30_000,
    )
    assert.notEqual(
      centsToDollars(breakdown.billedMediaCents + breakdown.clientPaidCents),
      39_375,
    )
  })

  it("39,375 is billed $30,000 plus unmatched delivery OOH burst ids (not a fee)", () => {
    const scheduleRows: ScheduleMonthRowInput[] = [
      row({
        lineItemId: "ooh-Cartology-small_format-0",
        component: "media",
        basis: "billing",
        month: "2026-01-01",
        amountCents: 2_500_00,
      }),
      row({
        lineItemId: "bvod-Leba-TVB APP-0",
        component: "media",
        basis: "billing",
        month: "2026-01-01",
        amountCents: 7_000_00,
      }),
      row({
        lineItemId: "newspaper-Leba-Australian Chinese Daily-0",
        component: "media",
        basis: "billing",
        month: "2026-02-01",
        amountCents: 5_000_00,
      }),
      row({
        lineItemId: "newspaper-Leba-Melbourne Chinese Post-1",
        component: "media",
        basis: "billing",
        month: "2026-02-01",
        amountCents: 1_500_00,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-0",
        component: "media",
        basis: "billing",
        month: "2026-02-01",
        amountCents: 12_500_00,
      }),
      row({
        lineItemId: "newspaper-Leba-Melbourne Chinese Post-1",
        component: "media",
        basis: "billing",
        month: "2026-03-01",
        amountCents: 1_500_00,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-0",
        component: "media",
        basis: "delivery",
        month: "2026-01-01",
        amountCents: 85_714,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-1",
        component: "media",
        basis: "delivery",
        month: "2026-01-01",
        amountCents: 85_714,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-2",
        component: "media",
        basis: "delivery",
        month: "2026-01-01",
        amountCents: 42_857,
      }),
      row({
        lineItemId: "newspaper-Leba-Australian Chinese Daily-0",
        component: "media",
        basis: "delivery",
        month: "2026-02-01",
        amountCents: 5_000_00,
      }),
      row({
        lineItemId: "newspaper-Leba-Melbourne Chinese Post-1",
        component: "media",
        basis: "delivery",
        month: "2026-02-01",
        amountCents: 1_500_00,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-0",
        component: "media",
        basis: "delivery",
        month: "2026-02-01",
        amountCents: 458_929,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-1",
        component: "media",
        basis: "delivery",
        month: "2026-02-01",
        amountCents: 458_929,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-2",
        component: "media",
        basis: "delivery",
        month: "2026-02-01",
        amountCents: 319_643,
      }),
      row({
        lineItemId: "bvod-Leba-TVB APP-0",
        component: "media",
        basis: "delivery",
        month: "2026-02-01",
        amountCents: 560_000,
      }),
      row({
        lineItemId: "newspaper-Leba-Melbourne Chinese Post-1",
        component: "media",
        basis: "delivery",
        month: "2026-03-01",
        amountCents: 1_500_00,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-0",
        component: "media",
        basis: "delivery",
        month: "2026-03-01",
        amountCents: 17_857,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-1",
        component: "media",
        basis: "delivery",
        month: "2026-03-01",
        amountCents: 17_857,
      }),
      row({
        lineItemId: "ooh-Cartology-small_format-2",
        component: "media",
        basis: "delivery",
        month: "2026-03-01",
        amountCents: 12_500,
      }),
      row({
        lineItemId: "bvod-Leba-TVB APP-0",
        component: "media",
        basis: "delivery",
        month: "2026-03-01",
        amountCents: 140_000,
      }),
    ]

    const slice = deriveApprovedSliceFromScheduleRows(scheduleRows)
    assert.ok(slice)
    assert.equal(centsToDollars(slice.totalCents), 30_000)
    assert.equal(
      slice.lines.reduce((s, l) => s + l.feeCents, 0),
      0,
    )

    const breakdown = computeMbaMediaBreakdown({
      scheduleRows,
      approvedIds: new Set(slice.lines.map((l) => l.lineItemId)),
      approvedMonths: null,
      unapprovedLineIds: new Set(),
    })
    assert.equal(centsToDollars(breakdown.billedMediaCents), 30_000)
    assert.equal(centsToDollars(breakdown.clientPaidCents), 9_375)
    assert.equal(
      centsToDollars(breakdown.billedMediaCents + breakdown.clientPaidCents),
      39_375,
    )
  })
})

describe("POST /api/mba/generate NO_FEE_BASIS", () => {
  it("maps PersistedDocError NO_FEE_BASIS to 422 like other 422 codes", () => {
    const src = readFileSync(
      join(here, "../../../app/api/mba/generate/route.ts"),
      "utf8",
    )
    assert.match(src, /error\.code === "NOT_FOUND"/)
    assert.match(src, /error\.code === "BAD_REQUEST"/)
    assert.match(src, /:\s*422/)
    assert.match(src, /code:\s*error\.code/)
    assert.doesNotMatch(src, /NO_FEE_BASIS[\s\S]{0,80}status:\s*200/)
  })
})
