/**
 * Shape-parity for dashboard_monthly_{publisher,client}_spend Postgres port.
 * DI-9/DI-10 lesson: post-flip bugs are shape gaps (field names/types), not logic.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  aggregateDashboardMonthlyClientSpend,
  aggregateDashboardMonthlyPublisherSpend,
  shapeDashboardMonthlyClientSpendSqlRows,
  shapeDashboardMonthlyPublisherSpendSqlRows,
  type DashboardMonthlyClientSpendRow,
  type DashboardMonthlyPublisherSpendRow,
  type DashboardMonthlySpendSourceRow,
} from "../dashboardMonthlySpend"

/**
 * Recorded Xano list-payload shape (fields consumed by
 * `getGlobalMonthlyPublisherSpend` / `getGlobalMonthlyClientSpend`).
 * Identifiers stay strings; amount is a finite number (AUD dollars).
 */
const RECORDED_XANO_PUBLISHER_RESPONSE: DashboardMonthlyPublisherSpendRow[] = [
  { month: "2025-07-01", publisher: "Meta", amount: 1500 },
  { month: "2025-07-01", publisher: "Unspecified", amount: 250.5 },
  { month: "2025-08-01", publisher: "Google", amount: 800 },
]

const RECORDED_XANO_CLIENT_RESPONSE: DashboardMonthlyClientSpendRow[] = [
  { month: "2025-07-01", client: "Acme Co", amount: 1750.5 },
  { month: "2025-08-01", client: "Unspecified", amount: 800 },
]

/** Fixture joined cells: delivery schedule_months × line_items × master. */
const FIXTURE_SOURCE_ROWS: DashboardMonthlySpendSourceRow[] = [
  {
    month: "2025-07-01",
    amountCents: 100_000,
    publisher: "Meta",
    client: "Acme Co",
  },
  {
    month: "2025-07-01",
    amountCents: 50_000,
    publisher: "Meta",
    client: "Acme Co",
  },
  {
    month: "2025-07-01",
    amountCents: 25_050,
    publisher: null,
    client: "Acme Co",
  },
  {
    month: "2025-08-01",
    amountCents: 80_000,
    publisher: "Google",
    client: "  ",
  },
]

function assertPublisherShape(rows: DashboardMonthlyPublisherSpendRow[]) {
  for (const row of rows) {
    assert.equal(typeof row.month, "string", "month must be string")
    assert.equal(typeof row.publisher, "string", "publisher must be string")
    assert.equal(typeof row.amount, "number", "amount must be number")
    assert.ok(Number.isFinite(row.amount), "amount must be finite")
    assert.deepEqual(Object.keys(row).sort(), ["amount", "month", "publisher"])
  }
}

function assertClientShape(rows: DashboardMonthlyClientSpendRow[]) {
  for (const row of rows) {
    assert.equal(typeof row.month, "string", "month must be string")
    assert.equal(typeof row.client, "string", "client must be string")
    assert.equal(typeof row.amount, "number", "amount must be number")
    assert.ok(Number.isFinite(row.amount), "amount must be finite")
    assert.deepEqual(Object.keys(row).sort(), ["amount", "client", "month"])
  }
}

describe("dashboard_monthly_publisher_spend shape parity", () => {
  it("fixture rows → aggregate → recorded Xano field names/types", () => {
    const rows = aggregateDashboardMonthlyPublisherSpend(FIXTURE_SOURCE_ROWS)
    assertPublisherShape(rows)
    assert.deepEqual(rows, RECORDED_XANO_PUBLISHER_RESPONSE)
  })

  it("SQL numeric-string amount coerces to number; month/publisher stay strings", () => {
    const shaped = shapeDashboardMonthlyPublisherSpendSqlRows([
      { month: "2025-07-01", publisher: "Meta", amount: "1500.00" },
      { month: "2025-07-01", publisher: "Unspecified", amount: "250.5" },
      { month: "2025-08-01", publisher: "Google", amount: "800" },
    ])
    assertPublisherShape(shaped)
    assert.deepEqual(shaped, RECORDED_XANO_PUBLISHER_RESPONSE)
  })
})

describe("dashboard_monthly_client_spend shape parity", () => {
  it("fixture rows → aggregate → recorded Xano field names/types", () => {
    const rows = aggregateDashboardMonthlyClientSpend(FIXTURE_SOURCE_ROWS)
    assertClientShape(rows)
    assert.deepEqual(rows, RECORDED_XANO_CLIENT_RESPONSE)
  })

  it("SQL numeric-string amount coerces to number; month/client stay strings", () => {
    const shaped = shapeDashboardMonthlyClientSpendSqlRows([
      { month: "2025-07-01", client: "Acme Co", amount: "1750.50" },
      { month: "2025-08-01", client: "Unspecified", amount: "800" },
    ])
    assertClientShape(shaped)
    assert.deepEqual(shaped, RECORDED_XANO_CLIENT_RESPONSE)
  })
})
