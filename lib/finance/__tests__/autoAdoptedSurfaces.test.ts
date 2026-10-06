/**
 * An auto_adopted match (ex-GST delta under $1) leaves approved_at null.
 * To bill, invoiced-vs-expected, and clearance must still treat it as settled.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { buildClearanceReport } from "../clearanceReport.js"
import { buildInvoicedVsExpected, type PlanExpectedRow } from "../invoicedVsExpected.js"
import { applyStatusOverlay, type PersistedFinanceStatusRow } from "../overlayFinanceStatus.js"
import { recordMatchesLifecycleFilter, summariseInvoicingFunnel } from "../sections/invoicingFunnel.js"
import type { BillingRecord } from "@/lib/types/financeBilling.js"

function rec(): BillingRecord {
  return {
    id: 1,
    clients_id: 1,
    client_name: "Acme",
    billing_type: "media",
    mba_number: "AC-001",
    campaign_name: "Winter",
    po_number: null,
    billing_month: "2026-07",
    invoice_date: null,
    payment_days: 30,
    payment_terms: "Net 30 days",
    status: "booked",
    line_items: [],
    total: 100,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    billed: false,
  }
}

function persisted(): PersistedFinanceStatusRow {
  return {
    id: 55,
    clients_id: 1,
    mba_number: "AC-001",
    campaign_name: "Winter",
    billing_type: "media",
    billing_month: "2026-07",
    billed: false,
    billed_at: null,
    billed_by: null,
    notes: null,
    exported_at: null,
    exported_by: null,
    invoice_key: "media:AC-001:2026-07",
    approved_at: null,
    approved_amount: 100.5,
    matched_xero_invoice_id: "inv-auto",
    xero_match_resolution: "auto_adopted",
    xero: {
      status: "DRAFT",
      amountDue: 110.55,
      dueDate: null,
      fullyPaidDate: null,
      subTotal: 100.5,
    },
  }
}

test("To bill counts an auto_adopted row as Issued outside AV", () => {
  const overlayed = applyStatusOverlay(rec(), new Map([["media:AC-001:2026-07", persisted()]]))
  assert.equal(overlayed.approved_at, null)
  assert.equal(overlayed.state, "issued_outside_av")
  assert.equal(overlayed.needs_attention, false)
  assert.equal(recordMatchesLifecycleFilter(overlayed.state, "ready"), false)
  assert.equal(recordMatchesLifecycleFilter(overlayed.state, "issued_outside_av"), true)

  const summary = summariseInvoicingFunnel([
    overlayed,
    { total: 40, state: "ready", billing_month: "2026-07", needs_attention: false },
  ])
  assert.equal(summary.issuedOutsideAv.cents, 10_000)
  assert.equal(summary.issuedOutsideAv.invoiceCount, 1)
  assert.equal(summary.ready.cents, 4_000)
  assert.equal(summary.needsAttentionCount, 0)
})

test("invoiced vs expected labels an auto_adopted row auto_adopted, not open", () => {
  const plan: PlanExpectedRow = {
    invoiceKey: "media:AC-001:2026-07",
    billingMonth: "2026-07",
    clientName: "Acme",
    clientsId: 1,
    mbaNumber: "AC-001",
    campaignName: "Winter",
    billingType: "media",
    approvedAmountCents: 10_050,
    scheduleCents: 10_000,
    billedAmountCents: null,
    matchedXeroInvoiceId: "inv-auto",
    xeroMatchResolution: "auto_adopted",
    invoiceNumber: "INV-AUTO",
    xeroStatus: "DRAFT",
    subTotalCents: 10_050,
  }
  const report = buildInvoicedVsExpected({
    fy: "fy27",
    clientId: null,
    type: "all",
    view: "all",
    invoices: [],
    plans: [plan],
  })
  assert.equal(report.pairs.length, 1)
  assert.equal(report.pairs[0]?.resolution, "auto_adopted")
  assert.notEqual(report.pairs[0]?.resolution, "open")
  assert.equal(report.pairs[0]?.deltaCents, 0)
})

test("clearance treats a sub-dollar auto_adopted draft as cleared", () => {
  const report = buildClearanceReport("2026-07", [
    {
      invoiceKey: "media:AC-001:2026-07",
      billingMonth: "2026-07",
      clientName: "Acme",
      mbaNumber: "AC-001",
      campaignName: "Winter",
      expectedCents: 10_000,
      xeroInvoiceId: "inv-auto",
      xeroStatus: "DRAFT",
      draftCents: 10_050,
      invoiceNumber: "INV-AUTO",
      appLines: [{ description: "Media", cents: 10_000 }],
      draftLines: [{ description: "Media", cents: 10_050 }],
    },
  ])
  assert.equal(report.counts.cleared, 1)
  assert.equal(report.counts.differs, 0)
  assert.equal(report.counts.missing, 0)
  assert.equal(report.cleared[0]?.state, "cleared")
  assert.equal(report.cleared[0]?.deltaCents, 50)
})
