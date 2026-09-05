/**
 * Planned-to-date per MBA: delivery-schedule expected-spend-to-date, FY-clamped.
 * Does not read Snowflake. Commercial set is booked|approved|completed (BAC).
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPlannedToDateByMba,
  parsePlannedToDateFyParam,
} from "../plannedToDate"

function typesShapeEntry(monthYear: string, amount: string) {
  return {
    monthYear,
    mediaTypes: [{ mediaType: "Television", lineItems: [{ amount }] }],
  }
}

function version(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mba_number: "inside001",
    version_number: 1,
    campaign_status: "booked",
    campaign_name: "Inside FY",
    campaign_start_date: "2025-08-01",
    campaign_end_date: "2025-08-31",
    published_at: "2025-08-01T00:00:00.000Z",
    deliverySchedule: [typesShapeEntry("August 2025", "$2,000.00")],
    ...overrides,
  }
}

test("parsePlannedToDateFyParam accepts start-year and all", () => {
  assert.equal(parsePlannedToDateFyParam("2025"), 2025)
  assert.equal(parsePlannedToDateFyParam("all"), "all")
  assert.equal(parsePlannedToDateFyParam("ALL"), "all")
})

test("parsePlannedToDateFyParam rejects missing and junk", () => {
  assert.equal(parsePlannedToDateFyParam(null), null)
  assert.equal(parsePlannedToDateFyParam(""), null)
  assert.equal(parsePlannedToDateFyParam("fy26"), null)
  assert.equal(parsePlannedToDateFyParam("2014"), null)
})

test("keys by lowercased trimmed mba_number (join key; stored value unchanged)", () => {
  const byMba = buildPlannedToDateByMba([version({ mba_number: " Boss001 " })], { fy: 2025 })
  assert.deepEqual(Object.keys(byMba), ["boss001"])
})

test("a campaign wholly inside the FY contributes expected-spend-to-date", () => {
  const byMba = buildPlannedToDateByMba([version()], { fy: 2025 })
  assert.equal(byMba.inside001, 2000)
})

test("a campaign straddling the FY boundary is clamped to in-window months", () => {
  const straddling = version({
    mba_number: "straddle001",
    campaign_start_date: "2025-06-01",
    campaign_end_date: "2025-08-31",
    deliverySchedule: [
      typesShapeEntry("June 2025", "$1,000.00"),
      typesShapeEntry("July 2025", "$500.00"),
      typesShapeEntry("August 2025", "$400.00"),
    ],
  })
  const fy2025 = buildPlannedToDateByMba([straddling], { fy: 2025 })
  assert.equal(fy2025.straddle001, 900)

  const fy2024 = buildPlannedToDateByMba([straddling], { fy: 2024 })
  assert.equal(fy2024.straddle001, 1000)
})

test("a campaign wholly outside the FY is absent", () => {
  const outside = version({
    mba_number: "outside001",
    campaign_start_date: "2024-08-01",
    campaign_end_date: "2024-08-31",
    deliverySchedule: [typesShapeEntry("August 2024", "$3,000.00")],
  })
  const byMba = buildPlannedToDateByMba([outside], { fy: 2025 })
  assert.equal(Object.hasOwn(byMba, "outside001"), false)
})

test("fy=all returns unclamped expected-spend-to-date", () => {
  const straddling = version({
    mba_number: "straddle001",
    campaign_start_date: "2025-06-01",
    campaign_end_date: "2025-08-31",
    deliverySchedule: [
      typesShapeEntry("June 2025", "$1,000.00"),
      typesShapeEntry("July 2025", "$500.00"),
      typesShapeEntry("August 2025", "$400.00"),
    ],
  })
  const byMba = buildPlannedToDateByMba([straddling], { fy: "all" })
  assert.equal(byMba.straddle001, 1900)
})

test("a campaign with no delivery schedule contributes 0 rather than throwing", () => {
  const empty = version({
    mba_number: "empty001",
    deliverySchedule: null,
    delivery_schedule: null,
    billingSchedule: null,
    billing_schedule: null,
  })
  const byMba = buildPlannedToDateByMba([empty], { fy: 2025 })
  assert.equal(byMba.empty001, 0)
})

test("does not apply a live-today date filter — completed BAC still counts", () => {
  const completed = version({
    mba_number: "done001",
    campaign_status: "completed",
  })
  const byMba = buildPlannedToDateByMba([completed], { fy: 2025 })
  assert.equal(byMba.done001, 2000)
})

test("excludes draft / cancelled (commercial BAC only)", () => {
  const draft = version({ mba_number: "draft001", campaign_status: "draft" })
  const cancelled = version({ mba_number: "cancel001", campaign_status: "cancelled" })
  const byMba = buildPlannedToDateByMba([draft, cancelled], { fy: 2025 })
  assert.deepEqual(byMba, {})
})

test("tenant scoping: allowedMbaKeys drops other tenants' campaigns", () => {
  const own = version({ mba_number: "own001" })
  const other = version({ mba_number: "other001" })
  const byMba = buildPlannedToDateByMba([own, other], {
    fy: 2025,
    allowedMbaKeys: new Set(["own001"]),
  })
  assert.equal(Object.hasOwn(byMba, "own001"), true)
  assert.equal(Object.hasOwn(byMba, "other001"), false)
})

test("does not apply client-name filters — every FY-touching BAC campaign is returned", () => {
  const a = version({ mba_number: "acme001", mp_client_name: "Acme" })
  const b = version({ mba_number: "beta001", mp_client_name: "Beta" })
  const byMba = buildPlannedToDateByMba([a, b], { fy: 2025 })
  assert.deepEqual(Object.keys(byMba).sort(), ["acme001", "beta001"])
})
