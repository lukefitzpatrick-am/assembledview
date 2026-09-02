/**
 * T0-9: Xero tables must never be truncate-reloaded by db:etl.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  KPI_FINANCE_TASKS_XERO_TABLE_NAMES,
  POSTGRES_AUTHORITATIVE_TABLES,
  reconCountMismatchFails,
  reloadableTableNames,
} from "../_etlTables"

const XERO_POSTGRES_AUTHORITATIVE = [
  "xero_ar_invoices",
  "xero_ap_bills",
  "xero_contacts",
  "xero_sync_exceptions",
  "xero_sync_log",
  "xero_invoice_matches",
  "xero_match_month_metrics",
  "xero_contact_links",
  "xero_client_aliases",
] as const

describe("POSTGRES_AUTHORITATIVE_TABLES (T0-9 Xero ETL)", () => {
  for (const name of XERO_POSTGRES_AUTHORITATIVE) {
    it(`lists ${name} as postgres-authoritative`, () => {
      assert.equal(
        POSTGRES_AUTHORITATIVE_TABLES.has(name),
        true,
        `${name} must be in POSTGRES_AUTHORITATIVE_TABLES`
      )
    })
  }

  it("filters every Xero table out of the kpi_finance_tasks_xero reloadable list", () => {
    const reloadable = reloadableTableNames(KPI_FINANCE_TASKS_XERO_TABLE_NAMES)
    for (const name of XERO_POSTGRES_AUTHORITATIVE) {
      assert.equal(
        reloadable.includes(name),
        false,
        `${name} must be filtered out of the reloadable list`
      )
    }
  })
})

describe("recon count gate (T0-9)", () => {
  it("does not fail on a Xero-table count mismatch", () => {
    for (const name of XERO_POSTGRES_AUTHORITATIVE) {
      assert.equal(
        reconCountMismatchFails(name, 10, 999),
        false,
        `${name} mismatch must not fail recon`
      )
    }
  })

  it("still fails on a 1:1 table count mismatch", () => {
    assert.equal(reconCountMismatchFails("clients", 10, 999), true)
  })

  it("still reports mba_line_approvals mismatch as informational", () => {
    assert.equal(reconCountMismatchFails("mba_line_approvals", 0, 12), false)
  })
})

const BILLING_LIFECYCLE_AUTHORITATIVE = [
  "finance_billing_records",
  "finance_billing_line_items",
] as const

describe("POSTGRES_AUTHORITATIVE_TABLES (FIN-ETL-1 billing lifecycle)", () => {
  for (const name of BILLING_LIFECYCLE_AUTHORITATIVE) {
    it(`lists ${name} as postgres-authoritative`, () => {
      assert.equal(
        POSTGRES_AUTHORITATIVE_TABLES.has(name),
        true,
        `${name} must be in POSTGRES_AUTHORITATIVE_TABLES`
      )
    })
  }

  it("contains no truncate step for finance_billing_records in the ETL table plan", () => {
    const reloadable = reloadableTableNames(KPI_FINANCE_TASKS_XERO_TABLE_NAMES)
    for (const name of BILLING_LIFECYCLE_AUTHORITATIVE) {
      assert.equal(
        reloadable.includes(name),
        false,
        `${name} must not appear in the truncate/reload plan`
      )
    }
  })
})
