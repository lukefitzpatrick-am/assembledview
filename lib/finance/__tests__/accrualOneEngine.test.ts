import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  accrualPayableAmount,
  accrualReceivableAmount,
  accrualServiceFeeAmount,
  computeAccrualByClient,
} from "@/lib/finance/computeAccrual"
import { mbaBreakdownFromAccrualRow } from "@/lib/finance/sections/useCostsAccrualData"
import type { BillingLineItem, BillingRecord, BillingStatus } from "@/lib/types/financeBilling"

/**
 * F1 (1 Nov 2026): one accrual engine. The per-MBA breakdown must sum to the
 * client row, client-pays media is never an agency payable, and SOW/retainer
 * fees only count for booked, approved, invoiced or paid records (D2).
 */

let nextLineId = 1

function line(
  partial: Partial<BillingLineItem> & Pick<BillingLineItem, "amount" | "line_type">,
): BillingLineItem {
  return {
    id: nextLineId++,
    finance_billing_records_id: 0,
    item_code: "X",
    description: "line",
    sort_order: 0,
    media_type: null,
    publisher_name: null,
    client_pays_media: false,
    ...partial,
  } as BillingLineItem
}

function rec(
  partial: Partial<BillingRecord> & Pick<BillingRecord, "id" | "billing_type">,
): BillingRecord {
  return {
    clients_id: 7,
    client_name: "Acme",
    mba_number: null,
    campaign_name: null,
    po_number: null,
    billing_month: "2026-10",
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

const RANGE = { from: "2026-10", to: "2026-10" }

function fixture() {
  const receivables: BillingRecord[] = [
    rec({ id: 1, billing_type: "media", mba_number: "ACME001", total: 1000 }),
    rec({
      id: 2,
      billing_type: "sow",
      mba_number: "ACME002",
      total: 500,
      line_items: [
        line({ amount: 400, line_type: "media" }),
        line({ amount: 100, line_type: "service" }),
      ],
    }),
    // Draft SOW: no revenue and, under D2, no fee deduction either.
    rec({
      id: 3,
      billing_type: "sow",
      mba_number: "ACME003",
      status: "draft",
      total: 300,
      line_items: [line({ amount: 60, line_type: "fee" })],
    }),
    rec({
      id: 4,
      billing_type: "retainer",
      mba_number: "ACME002",
      status: "invoiced",
      total: 250,
      line_items: [line({ amount: 50, line_type: "fee" })],
    }),
  ]
  const payables: BillingRecord[] = [
    rec({
      id: 10,
      billing_type: "payable",
      mba_number: "ACME001",
      line_items: [
        line({ amount: 400, line_type: "media" }),
        // Client pays the publisher directly: not an agency payable.
        line({ amount: 150, line_type: "media", client_pays_media: true }),
      ],
    }),
    rec({
      id: 11,
      billing_type: "payable",
      mba_number: "ACME002",
      line_items: [line({ amount: 200, line_type: "media" })],
    }),
  ]
  return { receivables, payables }
}

describe("accrual one engine (F1, D2)", () => {
  it("client row excludes client-pays payables and draft SOW fees", () => {
    const { receivables, payables } = fixture()
    const rows = computeAccrualByClient(receivables, payables, RANGE)
    assert.equal(rows.length, 1)
    const row = rows[0]!
    assert.equal(row.receivable_total, 1750)
    assert.equal(row.payable_total, 600)
    assert.equal(row.fees_total, 150)
    assert.equal(row.accrual, 1000)
  })

  it("MBA breakdown rows sum to the client row", () => {
    const { receivables, payables } = fixture()
    const [row] = computeAccrualByClient(receivables, payables, RANGE)
    const mba = mbaBreakdownFromAccrualRow(row!)
    const sum = (k: "receivable" | "payable" | "fees" | "accrual") =>
      Math.round(mba.reduce((s, m) => s + m[k] * 100, 0)) / 100
    assert.equal(sum("receivable"), row!.receivable_total)
    assert.equal(sum("payable"), row!.payable_total)
    assert.equal(sum("fees"), row!.fees_total)
    assert.equal(sum("accrual"), row!.accrual)
    const acme001 = mba.find((m) => m.mbaNumber === "ACME001")!
    assert.equal(acme001.payable, 400, "client-pays media is not an agency payable")
    assert.equal(mba.some((m) => m.mbaNumber === "ACME003"), false, "draft SOW is out of accrual")
  })

  it("fee amount follows the receivable status set", () => {
    const fee = (status: string) =>
      accrualServiceFeeAmount(
        rec({
          id: 20,
          billing_type: "sow",
          status: status as BillingStatus,
          line_items: [line({ amount: 80, line_type: "service" })],
        }),
      )
    for (const s of ["booked", "approved", "invoiced", "paid"]) assert.equal(fee(s), 80, s)
    for (const s of ["draft", "planned", "cancelled", ""]) assert.equal(fee(s), 0, s)
    assert.equal(
      accrualServiceFeeAmount(rec({ id: 21, billing_type: "media", line_items: [line({ amount: 80, line_type: "fee" })] })),
      0,
      "only SOW and retainer records carry accrual fees",
    )
  })

  it("rounds half-up at cents through roundMoney2", () => {
    assert.equal(accrualReceivableAmount(rec({ id: 30, billing_type: "media", total: 1.005 })), 1.01)
    assert.equal(
      accrualPayableAmount(
        rec({ id: 31, billing_type: "payable", line_items: [line({ amount: 2.675, line_type: "media" })] }),
      ),
      2.68,
    )
  })
})
