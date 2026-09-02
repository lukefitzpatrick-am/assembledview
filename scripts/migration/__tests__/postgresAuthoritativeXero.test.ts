/**
 * T0-9: Xero tables must never be truncate-reloaded by db:etl.
 * FIN-ETL-2: billing recon must follow the same two-list shape.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  KPI_FINANCE_TASKS_XERO_TABLE_NAMES,
  POSTGRES_AUTHORITATIVE_RECON_TABLES,
  POSTGRES_AUTHORITATIVE_TABLES,
  reconCountMismatchFails,
  reloadableTableNames,
} from "../_etlTables"

const RECON_TS = join(dirname(fileURLToPath(import.meta.url)), "../recon.ts")

function activeOneToOneNames(src: string): string[] {
  const start = src.indexOf("const ONE_TO_ONE")
  assert.ok(start >= 0, "ONE_TO_ONE declaration missing from recon.ts")
  const open = src.indexOf("[", start)
  const close = src.indexOf("\n]", open)
  const block = src.slice(open, close + 2)
  return [...block.matchAll(/^\s*\{ xano: "([^"]+)"/gm)].map((m) => m[1])
}

function fixtureReconExitCode(args: {
  oneToOne: readonly string[]
  xano: Record<string, number>
  supabase: Record<string, number>
}): number {
  let countFailures = 0
  for (const name of args.oneToOne) {
    if (
      reconCountMismatchFails(name, args.xano[name] ?? -1, args.supabase[name] ?? -1)
    ) {
      countFailures++
    }
  }
  return countFailures > 0 ? 1 : 0
}

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

describe("recon count gate (FIN-ETL-2 billing)", () => {
  it("does not fail on a billing-table count mismatch", () => {
    for (const name of BILLING_LIFECYCLE_AUTHORITATIVE) {
      assert.equal(
        reconCountMismatchFails(name, 444, 480),
        false,
        `${name} mismatch must not fail recon`
      )
    }
  })

  it("still fails on a table outside both authoritative sets", () => {
    assert.equal(
      (POSTGRES_AUTHORITATIVE_RECON_TABLES as readonly string[]).includes("clients"),
      false
    )
    assert.equal(POSTGRES_AUTHORITATIVE_TABLES.has("clients"), false)
    assert.equal(reconCountMismatchFails("clients", 10, 999), true)
  })

  it("does not list billing tables in ONE_TO_ONE", () => {
    const names = activeOneToOneNames(readFileSync(RECON_TS, "utf8"))
    for (const name of BILLING_LIFECYCLE_AUTHORITATIVE) {
      assert.equal(
        names.includes(name),
        false,
        `${name} must be commented out of ONE_TO_ONE`
      )
    }
  })

  it("fixture recon with a billing count delta exits 0", () => {
    const informational = POSTGRES_AUTHORITATIVE_RECON_TABLES as readonly string[]
    for (const name of BILLING_LIFECYCLE_AUTHORITATIVE) {
      assert.equal(
        informational.includes(name),
        true,
        `${name} must be reported as informational`
      )
    }
    assert.equal(
      fixtureReconExitCode({
        oneToOne: [
          "clients",
          "finance_billing_records",
          "finance_billing_line_items",
        ],
        xano: {
          clients: 45,
          finance_billing_records: 444,
          finance_billing_line_items: 1,
        },
        supabase: {
          clients: 45,
          finance_billing_records: 480,
          finance_billing_line_items: 50,
        },
      }),
      0
    )
    assert.equal(
      fixtureReconExitCode({
        oneToOne: ["clients"],
        xano: { clients: 45 },
        supabase: { clients: 46 },
      }),
      1
    )
  })
})
