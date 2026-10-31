import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  accrualPayableAmount,
  accrualReceivableAmount,
  accrualServiceFeeAmount,
  computeAccrualByClient,
} from "@/lib/finance/computeAccrual"
import { buildAccrualDetailRows } from "@/lib/finance/accrualDetailRows"
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

const RANGE = { from: "2026-10", to: "2026-11" }

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
    // Blank MBA lands on the "—" key.
    rec({ id: 5, billing_type: "media", mba_number: null, total: 80 }),
    // Credit: negative receivable.
    rec({ id: 6, billing_type: "media", mba_number: "ACME001", total: -120.5 }),
    // Second month, same client.
    rec({ id: 7, billing_type: "media", mba_number: "ACME001", billing_month: "2026-11", total: 640 }),
    // Second client.
    rec({ id: 8, clients_id: 9, client_name: "Beta", billing_type: "media", mba_number: "BETA001", total: 900 }),
    rec({
      id: 9,
      clients_id: 9,
      client_name: "Beta",
      billing_type: "sow",
      mba_number: "BETA002",
      status: "paid",
      total: 300,
      line_items: [line({ amount: 30, line_type: "service" })],
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
    rec({
      id: 12,
      billing_type: "payable",
      mba_number: null,
      line_items: [line({ amount: 30, line_type: "media" })],
    }),
    rec({
      id: 13,
      billing_type: "payable",
      mba_number: "ACME001",
      billing_month: "2026-11",
      line_items: [
        line({ amount: 300, line_type: "media" }),
        line({ amount: 75, line_type: "media", client_pays_media: true }),
      ],
    }),
    rec({
      id: 14,
      clients_id: 9,
      client_name: "Beta",
      billing_type: "payable",
      mba_number: "BETA001",
      line_items: [
        line({ amount: 500, line_type: "media" }),
        line({ amount: 99, line_type: "media", client_pays_media: true }),
      ],
    }),
  ]
  return { receivables, payables }
}

const cents = (n: number) => Math.round(n * 100)

function rowFor(rows: ReturnType<typeof computeAccrualByClient>, client: string, month: string) {
  const row = rows.find((r) => r.client_name === client && r.month === month)
  assert.ok(row, `${client} ${month}`)
  return row!
}

describe("accrual one engine (F1, D2)", () => {
  it("client rows exclude client-pays payables and draft SOW fees", () => {
    const { receivables, payables } = fixture()
    const rows = computeAccrualByClient(receivables, payables, RANGE)
    assert.equal(rows.length, 3)
    const oct = rowFor(rows, "Acme", "2026-10")
    assert.equal(oct.receivable_total, 1709.5)
    assert.equal(oct.payable_total, 630)
    assert.equal(oct.fees_total, 150)
    assert.equal(oct.accrual, 929.5)
    const nov = rowFor(rows, "Acme", "2026-11")
    assert.equal(nov.receivable_total, 640)
    assert.equal(nov.payable_total, 300)
    assert.equal(nov.fees_total, 0)
    assert.equal(nov.accrual, 340)
    const beta = rowFor(rows, "Beta", "2026-10")
    assert.equal(beta.receivable_total, 1200)
    assert.equal(beta.payable_total, 500)
    assert.equal(beta.fees_total, 30)
    assert.equal(beta.accrual, 670)
  })

  it("MBA breakdown rows sum to every client row", () => {
    const { receivables, payables } = fixture()
    const rows = computeAccrualByClient(receivables, payables, RANGE)
    for (const row of rows) {
      const mba = mbaBreakdownFromAccrualRow(row)
      const sum = (k: "receivable" | "payable" | "fees" | "accrual") =>
        mba.reduce((s, m) => s + cents(m[k]), 0)
      assert.equal(sum("receivable"), cents(row.receivable_total), `${row.client_name} ${row.month} receivable`)
      assert.equal(sum("payable"), cents(row.payable_total), `${row.client_name} ${row.month} payable`)
      assert.equal(sum("fees"), cents(row.fees_total), `${row.client_name} ${row.month} fees`)
      assert.equal(sum("accrual"), cents(row.accrual), `${row.client_name} ${row.month} accrual`)
    }
    const oct = mbaBreakdownFromAccrualRow(rowFor(rows, "Acme", "2026-10"))
    const acme001 = oct.find((m) => m.mbaNumber === "ACME001")!
    assert.equal(acme001.payable, 400, "client-pays media is not an agency payable")
    assert.equal(acme001.receivable, 879.5, "credit nets off the MBA receivable")
    const blank = oct.find((m) => m.mbaNumber === "—")!
    assert.equal(blank.receivable, 80)
    assert.equal(blank.payable, 30)
    assert.equal(oct.some((m) => m.mbaNumber === "ACME003"), false, "draft SOW is out of accrual")
  })

  it("detail sheet sides sum to the summary totals", () => {
    const { receivables, payables } = fixture()
    const rows = computeAccrualByClient(receivables, payables, RANGE)
    const detail = buildAccrualDetailRows(rows)
    for (const row of rows) {
      const side = (s: string) =>
        detail
          .filter((d) => d.client === row.client_name && d.month === row.month && d.side === s)
          .reduce((t, d) => t + cents(d.amount), 0)
      assert.equal(side("Receivable"), cents(row.receivable_total), `${row.client_name} ${row.month} receivable`)
      assert.equal(side("Payable (agency)"), cents(row.payable_total), `${row.client_name} ${row.month} payable`)
      assert.equal(side("Fee (SOW/retainer)"), cents(row.fees_total), `${row.client_name} ${row.month} fees`)
    }
  })

  it("fee amount follows the receivable status set, case-sensitive as today", () => {
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
    for (const s of ["draft", "cancelled", "expected", "disputed", "Booked", ""]) assert.equal(fee(s), 0, s)
    assert.equal(
      accrualServiceFeeAmount(rec({ id: 21, billing_type: "media", line_items: [line({ amount: 80, line_type: "fee" })] })),
      0,
      "only SOW and retainer records carry accrual fees",
    )
  })

  it("rounds once, half-up away from zero, through roundMoney2", () => {
    assert.equal(accrualReceivableAmount(rec({ id: 30, billing_type: "media", total: 1.005 })), 1.01)
    const pay = (amounts: number[]) =>
      accrualPayableAmount(
        rec({
          id: 31,
          billing_type: "payable",
          line_items: amounts.map((amount) => line({ amount, line_type: "media" })),
        }),
      )
    assert.equal(pay([1.005]), 1.01)
    assert.equal(pay([-2.675]), -2.68)
    assert.equal(pay([0.5, 0.505]), 1.01, "sums first, rounds once")
  })
})
