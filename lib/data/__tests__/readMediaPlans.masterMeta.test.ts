import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  mapPlanMasterByMbaFromLoadedRows,
  mapPlanMastersFromLoadedRows,
} from "@/lib/data/readMediaPlans"

/**
 * Old mapping feeds the full version row (including legacy_schedules).
 * New mapping feeds the same meta columns the SQL select now returns.
 */
function narrowVersionMeta(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    masterId: row.masterId ?? row.master_id,
    versionNumber: row.versionNumber ?? row.version_number,
    publishedAt: row.publishedAt ?? row.published_at,
  }
}

const LEGACY = {
  billingSchedule: [{ month: "2026-03", amount: 999_999 }],
  deliverySchedule: [{ month: "2026-03", amount: 1 }],
  payload: "x".repeat(4096),
}

const MASTERS: Record<string, unknown>[] = [
  {
    id: 1,
    createdAt: "2026-03-01T00:00:00.000Z",
    mbaNumber: "TheY001",
    clientId: 12,
    mpClientName: "The Y",
    campaignName: "Spring",
    campaignStatus: "booked",
    campaignStartDate: "2026-03-01",
    campaignEndDate: "2026-06-30",
    campaignBudgetCents: 1_500_000,
    publishedVersionId: 101,
  },
  {
    id: 2,
    createdAt: "2026-01-15T00:00:00.000Z",
    mbaNumber: "PGAAUS015",
    clientId: 44,
    mpClientName: "PGA",
    campaignName: "Open",
    campaignStatus: "approved",
    campaignStartDate: "2026-01-01",
    campaignEndDate: "2026-12-31",
    campaignBudgetCents: "250000",
    publishedVersionId: 201,
  },
  {
    id: 3,
    mbaNumber: "NONE001",
    clientId: null,
    mpClientName: "",
    campaignName: "Empty",
    campaignStatus: "planned",
    campaignStartDate: "2026-04-01",
    campaignEndDate: "2026-04-30",
    campaignBudgetCents: null,
    publishedVersionId: null,
  },
]

const VERSIONS: Record<string, unknown>[] = [
  {
    id: 100,
    masterId: 1,
    versionNumber: 14,
    publishedAt: "2026-02-01T00:00:00.000Z",
    legacySchedules: LEGACY,
    channelFlags: { television: true },
    campaignBudgetCents: 1,
    mbaNumber: "TheY001",
  },
  {
    id: 101,
    masterId: 1,
    versionNumber: 15,
    publishedAt: "2026-03-01T00:00:00.000Z",
    legacySchedules: LEGACY,
    channelFlags: { social: true },
    approvedSlice: { frozen: true },
    mbaNumber: "TheY001",
  },
  {
    id: 102,
    masterId: 1,
    versionNumber: 16,
    publishedAt: null,
    legacySchedules: LEGACY,
    mbaNumber: "TheY001",
  },
  {
    id: 201,
    masterId: 2,
    versionNumber: 3,
    publishedAt: null,
    legacySchedules: LEGACY,
    mbaNumber: "PGAAUS015",
  },
  {
    id: 202,
    masterId: 2,
    versionNumber: "9",
    publishedAt: null,
    legacySchedules: LEGACY,
    mbaNumber: "PGAAUS015",
  },
  {
    id: 301,
    masterId: 99,
    versionNumber: 40,
    publishedAt: "2026-05-01T00:00:00.000Z",
    legacySchedules: LEGACY,
    mbaNumber: "OTHER",
  },
]

describe("readMediaPlans master meta parity", () => {
  const full = mapPlanMastersFromLoadedRows(MASTERS, VERSIONS)
  const narrow = mapPlanMastersFromLoadedRows(MASTERS, VERSIONS.map(narrowVersionMeta))

  it("narrow version columns match a full-payload map for every master", () => {
    assert.deepEqual(narrow, full)
  })

  it("stamped pointer wins over a higher unstamped version", () => {
    const row = full.find((r) => r.mba_number === "TheY001")
    assert.ok(row)
    assert.equal(row.version_number, 15)
    assert.equal(row.published_version_id, 101)
    assert.equal(row.mp_campaignbudget, 15000)
    assert.equal(row.legacy_schedules, undefined)
    assert.equal(row.billingSchedule, undefined)
  })

  it("unstamped pointer falls back to max version number and keeps the pointer id", () => {
    const row = full.find((r) => r.mba_number === "PGAAUS015")
    assert.ok(row)
    assert.equal(row.version_number, 9)
    assert.equal(row.published_version_id, 201)
    assert.equal(row.mp_campaignbudget, 2500)
  })

  it("null pointer with no versions is version 0", () => {
    const row = full.find((r) => r.mba_number === "NONE001")
    assert.ok(row)
    assert.equal(row.version_number, 0)
    assert.equal(row.published_version_id, null)
  })

  it("by-MBA on narrow rows matches the full-list pick", () => {
    for (const mba of ["TheY001", "they001", "PGAAUS015", "pgaaus015", "NONE001", "missing"]) {
      const target = mba.trim().toLowerCase()
      const fromList =
        full.find((row) => String(row.mba_number ?? "").trim().toLowerCase() === target) ?? null
      const fromMba = mapPlanMasterByMbaFromLoadedRows(
        MASTERS,
        VERSIONS.map(narrowVersionMeta),
        mba,
      )
      assert.deepEqual(fromMba, fromList, mba)
    }
  })
})
