import { afterEach, describe, expect, it } from "vitest"
import { snapshotChecksum } from "@/lib/finance/snapshotChecksum"
import {
  checksumForPlanRows,
  PLANC_ROWS_MISSING_PREFIX,
  resetPlanRowsMissingLogForTests,
  resolvePlanCRowsDualWriteMode,
  rowsSnapshotPayload,
  setPlanRowsTransportForTests,
  dualWritePlanRowsForVersion,
} from "@/lib/finance/rows/dualWrite"
import type { AuthoritativeFinancials } from "@/lib/finance/authority/computeAndPersist"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"

afterEach(() => {
  setPlanRowsTransportForTests(null)
  resetPlanRowsMissingLogForTests()
  delete process.env.PLANC_ROWS_DUAL_WRITE
})

describe("dualWritePlanRows", () => {
  it("resolvePlanCRowsDualWriteMode defaults off; on for on/1/true", () => {
    expect(resolvePlanCRowsDualWriteMode(undefined)).toBe("off")
    expect(resolvePlanCRowsDualWriteMode("off")).toBe("off")
    expect(resolvePlanCRowsDualWriteMode("on")).toBe("on")
    expect(resolvePlanCRowsDualWriteMode("1")).toBe("on")
    expect(resolvePlanCRowsDualWriteMode("TRUE")).toBe("on")
  })

  it("checksumForPlanRows matches snapshotChecksum of canonical payload", () => {
    const billingRows: PlanBillingRow[] = [
      {
        media_plan_version: 1,
        mba_number: "MBA",
        line_uid: "u1",
        line_source: "channel",
        media_type: "search",
        month: "2026-06",
        media_amount: 10,
        fee_amount: 2,
        adserving_amount: 0,
        billable_amount: 12,
        client_pays_for_media: false,
        is_manual_override: false,
        source: "auto",
        override_id: null,
      },
    ]
    const deliveryRows: PlanDeliveryRow[] = [
      {
        media_plan_version: 1,
        mba_number: "MBA",
        line_uid: "u1",
        line_source: "channel",
        media_type: "search",
        month: "2026-06",
        delivery_amount: 12,
        media_amount_full: 10,
      },
    ]
    expect(checksumForPlanRows({ billingRows, deliveryRows })).toBe(
      snapshotChecksum(rowsSnapshotPayload({ billingRows, deliveryRows }))
    )
  })

  it("dualWrite no-ops when flag off", async () => {
    process.env.PLANC_ROWS_DUAL_WRITE = "off"
    const result = await dualWritePlanRowsForVersion({
      versionId: 1,
      mba_number: "MBA",
      authoritative: {
        billingSchedule: [],
        deliverySchedule: [],
        totals: {
          grossMedia: 0,
          fee: 0,
          adServing: 0,
          production: 0,
          nettExGst: 0,
          nettIncGst: 0,
        },
        perLine: [],
        validation: { billableEqualsMba: true, deltaExGst: 0 },
        lineItems: [],
      } satisfies AuthoritativeFinancials,
      lineItems: [],
      overrides: [],
    })
    expect(result.skipped).toBe(true)
    expect(result.wrote).toBe(false)
  })

  it("dualWrite delete-then-bulk + checksum when flag on", async () => {
    process.env.PLANC_ROWS_DUAL_WRITE = "on"
    const deleted: string[] = []
    const bulks: string[] = []
    let checksum: string | null = null

    setPlanRowsTransportForTests({
      async listBilling() {
        return [{ id: 11 }]
      },
      async listDelivery() {
        return [{ id: 22 }]
      },
      async deleteBilling(id) {
        deleted.push(`b:${id}`)
      },
      async deleteDelivery(id) {
        deleted.push(`d:${id}`)
      },
      async bulkBilling(rows) {
        bulks.push(`b:${rows.length}`)
      },
      async bulkDelivery(rows) {
        bulks.push(`d:${rows.length}`)
      },
      async patchVersionChecksum(_id, value) {
        checksum = value
      },
    })

    const result = await dualWritePlanRowsForVersion({
      versionId: 99,
      mba_number: "MBA",
      authoritative: {
        billingSchedule: [],
        deliverySchedule: [],
        totals: {
          grossMedia: 0,
          fee: 0,
          adServing: 0,
          production: 0,
          nettExGst: 0,
          nettIncGst: 0,
        },
        perLine: [],
        validation: { billableEqualsMba: true, deltaExGst: 0 },
        lineItems: [],
      },
      lineItems: [],
      overrides: [],
    })

    expect(result.wrote).toBe(true)
    expect(deleted.sort()).toEqual(["b:11", "d:22"])
    expect(checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it("logs [planc-rows-missing] once when list 404s (via transport throw path)", async () => {
    process.env.PLANC_ROWS_DUAL_WRITE = "on"
    const warnings: unknown[][] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args)
    }
    try {
      setPlanRowsTransportForTests({
        async listBilling() {
          throw new Error("missing")
        },
        async listDelivery() {
          return []
        },
        async deleteBilling() {},
        async deleteDelivery() {},
        async bulkBilling() {},
        async bulkDelivery() {},
        async patchVersionChecksum() {},
      })
      // Transport throws are caught inside dualWrite's try — listBilling throw
      // propagates to outer catch and logs dual-write once.
      await dualWritePlanRowsForVersion({
        versionId: 7,
        mba_number: "MBA",
        authoritative: {
          billingSchedule: [],
          deliverySchedule: [],
          totals: {
            grossMedia: 0,
            fee: 0,
            adServing: 0,
            production: 0,
            nettExGst: 0,
            nettIncGst: 0,
          },
          perLine: [],
          validation: { billableEqualsMba: true, deltaExGst: 0 },
          lineItems: [],
        },
        lineItems: [],
        overrides: [],
      })
      expect(
        warnings.some((a) => a[0] === PLANC_ROWS_MISSING_PREFIX)
      ).toBe(true)
    } finally {
      console.warn = original
    }
  })
})
