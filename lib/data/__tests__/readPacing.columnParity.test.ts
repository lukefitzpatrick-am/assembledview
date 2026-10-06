import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  PACING_MASTER_VERSION_COLUMNS,
  PACING_VERSION_COLUMNS,
  mapPacingMasterFromPostgres,
  mapPacingVersionFromPostgres,
} from "@/lib/data/readPacing"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"

/**
 * Old mapping feeds the full version row (including legacy_schedules).
 * New mapping feeds the columns the SQL select now returns.
 */
function pickColumns(
  row: Record<string, unknown>,
  columns: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(columns)) out[key] = row[key]
  return out
}

function asPublishedApi(row: Record<string, unknown>): Record<string, unknown> {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

const LEGACY = {
  billingSchedule: [{ month: "2026-03", amount: 999_999 }],
  deliverySchedule: [{ month: "2026-03", amount: 1 }],
  payload: "x".repeat(4096),
}

const MASTER: Record<string, unknown> = {
  id: 7,
  createdAt: "2026-03-01T00:00:00.000Z",
  mbaNumber: "001001",
  clientId: 12,
  mpClientName: "Golf Australia",
  campaignName: "Open",
  campaignStatus: "booked",
  campaignStartDate: "2026-03-01T00:00:00.000Z",
  campaignEndDate: "2026-06-30",
  campaignBudgetCents: "1500000",
  publishedVersionId: 101,
}

const PUBLISHED_FULL: Record<string, unknown> = {
  id: 101,
  createdAt: "2026-03-01T00:00:00.000Z",
  masterId: 7,
  versionNumber: 15,
  mbaNumber: "001001",
  campaignName: "Open v15",
  campaignStatus: "approved",
  campaignStartDate: "2026-03-01",
  campaignEndDate: "2026-06-30T00:00:00.000Z",
  brand: "Golf",
  clientContact: "Ada",
  poNumber: "00100",
  campaignBudgetCents: 1,
  fixedFee: false,
  channelFlags: { television: true },
  legacySchedules: LEGACY,
  approvedSlice: { frozen: true },
  mbaScope: { partial: false },
  snapshotChecksum: "abc",
  publishedAt: null,
  publishedBy: null,
  miResolution: {},
  mediaPlanFile: { url: "https://files.example/plan" },
  mbaPdfFile: { url: "https://files.example/mba" },
  aaMediaPlanFile: null,
}

const VERSION_FULL: Record<string, unknown> = {
  ...PUBLISHED_FULL,
  versionNumber: "9",
  brand: null,
  campaignName: null,
  campaignStatus: "booked",
}

describe("readPacing version column parity", () => {
  it("master crawl selects id, masterId, and versionNumber only", () => {
    assert.deepEqual(Object.keys(PACING_MASTER_VERSION_COLUMNS), [
      "id",
      "masterId",
      "versionNumber",
    ])
    assert.equal("publishedAt" in PACING_MASTER_VERSION_COLUMNS, false)
    assert.equal("legacySchedules" in PACING_MASTER_VERSION_COLUMNS, false)
  })

  it("version crawl selects only the columns the version mapper reads", () => {
    assert.deepEqual(Object.keys(PACING_VERSION_COLUMNS), [
      "id",
      "mbaNumber",
      "versionNumber",
      "brand",
      "campaignName",
      "campaignStatus",
      "campaignStartDate",
      "campaignEndDate",
    ])
    assert.equal("legacySchedules" in PACING_VERSION_COLUMNS, false)
    assert.equal("publishedAt" in PACING_VERSION_COLUMNS, false)
  })

  it("narrow published version matches a full payload, including an unstamped pointer", () => {
    const full = mapPacingMasterFromPostgres(MASTER, asPublishedApi(PUBLISHED_FULL), 99)
    const narrow = mapPacingMasterFromPostgres(
      MASTER,
      asPublishedApi(pickColumns(PUBLISHED_FULL, PACING_MASTER_VERSION_COLUMNS)),
      99,
    )
    assert.deepEqual(narrow, full)
    assert.equal(full.version_number, 15)
    assert.equal(full.mba_number, "001001")
    assert.equal(full.mp_campaignbudget, 15000)
    assert.equal(full.campaign_start_date, "2026-03-01")
    assert.equal(full.legacy_schedules, undefined)
    assert.equal(full.published_at, undefined)
  })

  it("null pointer falls back to the supplied max watermark", () => {
    const debris = { ...MASTER, publishedVersionId: null }
    const row = mapPacingMasterFromPostgres(debris, null, 9)
    assert.equal(row.version_number, 9)
    assert.equal(row.legacy_schedules, undefined)
  })

  it("narrow version row matches a full payload that carries legacy_schedules", () => {
    const full = mapPacingVersionFromPostgres(VERSION_FULL)
    const narrow = mapPacingVersionFromPostgres(
      pickColumns(VERSION_FULL, PACING_VERSION_COLUMNS),
    )
    assert.deepEqual(narrow, full)
    assert.deepEqual(narrow, {
      id: 101,
      mba_number: "001001",
      version_number: 9,
      brand: null,
      campaign_name: null,
      campaign_status: "booked",
      campaign_start_date: "2026-03-01",
      campaign_end_date: "2026-06-30",
    })
    assert.equal(full.legacy_schedules, undefined)
  })
})
