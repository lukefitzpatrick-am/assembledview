import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { AccrualRow } from "@/lib/finance/computeAccrual"
import type { BillingRecord } from "@/lib/types/financeBilling"
import {
  investmentHrefForAccrual,
  mbaBreakdownFromAccrualRow,
} from "@/lib/finance/sections/useCostsAccrualData"

function stubRecord(partial: Partial<BillingRecord> & Pick<BillingRecord, "id" | "billing_type">): BillingRecord {
  return {
    clients_id: 1,
    client_name: "Acme",
    mba_number: null,
    campaign_name: null,
    po_number: null,
    billing_month: "2025-08",
    invoice_date: null,
    payment_days: 0,
    payment_terms: "",
    status: "booked",
    line_items: [],
    total: 0,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    ...partial,
  }
}

describe("costsAccrualHelpers", () => {
  it("builds Investment href with client + month scope", () => {
    const href = investmentHrefForAccrual("Acme Co", 42, "2025-09")
    const u = new URL(href, "http://local")
    assert.equal(u.pathname, "/finance/investment")
    assert.equal(u.searchParams.get("client"), "Acme Co")
    assert.equal(u.searchParams.get("clients"), "42")
    assert.equal(u.searchParams.get("from"), "2025-09")
    assert.equal(u.searchParams.get("to"), "2025-09")
    assert.equal(u.searchParams.get("month"), "2025-09")
  })

  it("rolls MBA breakdown from the same AccrualRow contributors", () => {
    const row: AccrualRow = {
      clients_id: 1,
      client_name: "Acme",
      month: "2025-08",
      receivable_total: 1000,
      payable_total: 400,
      fees_total: 50,
      accrual: 550,
      reconciled: false,
      reconciled_at: null,
      contributing_receivables: [
        stubRecord({
          id: 1,
          billing_type: "media",
          mba_number: "ACME001",
          campaign_name: "Spring",
          total: 1000,
        }),
      ],
      contributing_payables: [
        stubRecord({
          id: 2,
          billing_type: "payable",
          mba_number: "ACME001",
          campaign_name: "Spring",
          line_items: [
            {
              id: 1,
              finance_billing_records_id: 2,
              item_code: "MEDIA",
              description: "Media",
              amount: 400,
              sort_order: 0,
              media_type: "search",
              line_type: "media",
              publisher_name: null,
              client_pays_media: false,
            },
          ],
        }),
      ],
    }
    const mba = mbaBreakdownFromAccrualRow(row)
    assert.equal(mba.length, 1)
    assert.equal(mba[0]!.mbaNumber, "ACME001")
    assert.equal(mba[0]!.receivable, 1000)
    assert.equal(mba[0]!.payable, 400)
    assert.equal(mba[0]!.accrual, 600)
  })
})
