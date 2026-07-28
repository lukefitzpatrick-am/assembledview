/**
 * Plan C S2-P6 — rows checksum tripwire unit tests.
 */
import { describe, expect, it } from "vitest"
import { checksumForPlanRows } from "@/lib/finance/rows/dualWrite"
import {
  canonicalizeBillingRow,
  flagChecksumDrift,
  flagMigratedEmptySide,
  flagRowsChecksumFindings,
  flagWriterBypass,
  recomputeRowsChecksum,
  shouldRunRowsChecksumAudit,
  sortBillingRowsForChecksum,
  type RowsChecksumVersionMeta,
} from "@/lib/finance/rows/checksumAudit"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"

const billing: PlanBillingRow = {
  media_plan_version: 42,
  mba_number: "ACME001",
  line_uid: "uid-1",
  line_source: "channel",
  media_type: "search",
  month: "2026-06",
  media_amount: 1000,
  fee_amount: 200,
  adserving_amount: 0,
  billable_amount: 1200,
  client_pays_for_media: false,
  is_manual_override: false,
  source: "auto",
  override_id: null,
}

const delivery: PlanDeliveryRow = {
  media_plan_version: 42,
  mba_number: "ACME001",
  line_uid: "uid-1",
  line_source: "channel",
  media_type: "search",
  month: "2026-06",
  delivery_amount: 1200,
  media_amount_full: 1000,
}

function meta(overrides?: Partial<RowsChecksumVersionMeta>): RowsChecksumVersionMeta {
  return {
    id: 42,
    mba_number: "ACME001",
    version_number: 1,
    isCurrent: true,
    billing_rows_migrated: true,
    snapshot_checksum: checksumForPlanRows({
      billingRows: [billing],
      deliveryRows: [delivery],
    }),
    ...overrides,
  }
}

describe("shouldRunRowsChecksumAudit", () => {
  it("runs on Monday UTC; skips other days unless forced", () => {
    // 2026-07-27 is Monday UTC
    expect(shouldRunRowsChecksumAudit({ now: new Date("2026-07-27T12:00:00Z") })).toBe(true)
    // Tuesday
    expect(shouldRunRowsChecksumAudit({ now: new Date("2026-07-28T12:00:00Z") })).toBe(false)
    expect(
      shouldRunRowsChecksumAudit({ now: new Date("2026-07-28T12:00:00Z"), force: true })
    ).toBe(true)
  })
})

describe("canonicalizeBillingRow", () => {
  it("strips id/created_at so Xano extras do not affect checksum", () => {
    const raw = {
      ...billing,
      id: 999,
      created_at: "2026-07-01T00:00:00Z",
    }
    const c = canonicalizeBillingRow(raw as unknown as Record<string, unknown>)
    expect(c).toEqual(billing)
    expect(recomputeRowsChecksum({ billingRows: [c], deliveryRows: [delivery] })).toBe(
      checksumForPlanRows({ billingRows: [billing], deliveryRows: [delivery] })
    )
  })
})

describe("flagChecksumDrift", () => {
  it("returns null when recomputed matches stored", () => {
    expect(
      flagChecksumDrift({
        meta: meta(),
        billingRows: [billing],
        deliveryRows: [delivery],
      })
    ).toBeNull()
  })

  it("flags checksum_drift on mismatch for migrated current version", () => {
    const finding = flagChecksumDrift({
      meta: meta({ snapshot_checksum: "deadbeef".repeat(8) }),
      billingRows: [billing],
      deliveryRows: [delivery],
    })
    expect(finding).toMatchObject({
      kind: "checksum_drift",
      severity: "live",
      version: 42,
      mba_number: "ACME001",
    })
    expect(finding?.recomputedChecksum).toBe(
      checksumForPlanRows({ billingRows: [billing], deliveryRows: [delivery] })
    )
  })

  it("skips non-current and unmigrated versions", () => {
    expect(
      flagChecksumDrift({
        meta: meta({ isCurrent: false, snapshot_checksum: "x" }),
        billingRows: [billing],
        deliveryRows: [delivery],
      })
    ).toBeNull()
    expect(
      flagChecksumDrift({
        meta: meta({ billing_rows_migrated: false, snapshot_checksum: "x" }),
        billingRows: [billing],
        deliveryRows: [delivery],
      })
    ).toBeNull()
  })
})

describe("flagWriterBypass", () => {
  it("flags rows on unmigrated versions", () => {
    expect(
      flagWriterBypass({
        meta: meta({ billing_rows_migrated: false }),
        billingRowCount: 2,
        deliveryRowCount: 1,
      })
    ).toMatchObject({
      kind: "writer_bypass",
      rows: 3,
      severity: "live",
    })
  })

  it("ignores migrated versions and empty row sets", () => {
    expect(
      flagWriterBypass({
        meta: meta({ billing_rows_migrated: true }),
        billingRowCount: 5,
        deliveryRowCount: 5,
      })
    ).toBeNull()
    expect(
      flagWriterBypass({
        meta: meta({ billing_rows_migrated: false }),
        billingRowCount: 0,
        deliveryRowCount: 0,
      })
    ).toBeNull()
  })
})

describe("flagMigratedEmptySide", () => {
  it("flags migrated versions with zero rows on either side", () => {
    expect(
      flagMigratedEmptySide({
        meta: meta(),
        billingRowCount: 5,
        deliveryRowCount: 0,
      })
    ).toMatchObject({
      kind: "migrated_empty_side",
      rows: 5,
      severity: "live",
    })
    expect(
      flagMigratedEmptySide({
        meta: meta({ isCurrent: false }),
        billingRowCount: 0,
        deliveryRowCount: 0,
      })
    ).toMatchObject({
      kind: "migrated_empty_side",
      rows: 0,
      severity: "history",
    })
  })

  it("ignores unmigrated and both-sides-populated versions", () => {
    expect(
      flagMigratedEmptySide({
        meta: meta({ billing_rows_migrated: false }),
        billingRowCount: 0,
        deliveryRowCount: 0,
      })
    ).toBeNull()
    expect(
      flagMigratedEmptySide({
        meta: meta(),
        billingRowCount: 2,
        deliveryRowCount: 3,
      })
    ).toBeNull()
  })
})

describe("flagRowsChecksumFindings", () => {
  it("emits bypass + drift together when both apply across versions", () => {
    const goodChecksum = checksumForPlanRows({
      billingRows: sortBillingRowsForChecksum([billing]),
      deliveryRows: [delivery],
    })
    const findings = flagRowsChecksumFindings({
      versions: [
        meta({ id: 1, snapshot_checksum: goodChecksum }),
        meta({
          id: 2,
          billing_rows_migrated: false,
          snapshot_checksum: null,
          isCurrent: false,
        }),
      ],
      billingByVersion: new Map([
        [1, [billing]],
        [2, [billing]],
      ]),
      deliveryByVersion: new Map([
        [1, [delivery]],
        [2, [delivery]],
      ]),
    })
    expect(findings.map((f) => f.kind).sort()).toEqual(["writer_bypass"])
    expect(findings[0]?.version).toBe(2)
  })

  it("emits migrated_empty_side for migrated versions missing a side", () => {
    const findings = flagRowsChecksumFindings({
      versions: [meta({ id: 9, snapshot_checksum: null })],
      billingByVersion: new Map([[9, [billing]]]),
      deliveryByVersion: new Map([[9, []]]),
    })
    expect(findings.map((f) => f.kind)).toContain("migrated_empty_side")
  })
})
