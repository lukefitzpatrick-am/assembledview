import assert from "node:assert/strict"
import test from "node:test"
import type { BillingState } from "../../billingLifecycle.js"
import {
  DEFAULT_INVOICING_LIFECYCLE_FILTER,
  formatFunnelCountCaption,
  recordMatchesLifecycleFilter,
  summariseInvoicingFunnel,
} from "../invoicingFunnel.js"

function rec(partial: {
  total: number
  state?: BillingState | null
  billing_month?: string
}) {
  return {
    total: partial.total,
    state: partial.state,
    billing_month: partial.billing_month ?? "2026-07",
  }
}

test("the three funnel amounts sum to the scope total for a fixture month", () => {
  const summary = summariseInvoicingFunnel([
    rec({ total: 100, state: "ready" }),
    rec({ total: 250, state: "ready" }),
    rec({ total: 400, state: "approved" }),
    rec({ total: 80, state: "sent_to_finance" }),
    rec({ total: 20, state: "issued" }),
    rec({ total: 50, state: "paid" }),
  ])
  assert.equal(summary.ready.cents, 35_000)
  assert.equal(summary.approved.cents, 40_000)
  assert.equal(summary.sentToFinance.cents, 15_000)
  assert.equal(
    summary.ready.cents + summary.approved.cents + summary.sentToFinance.cents,
    summary.totalCents
  )
  assert.equal(summary.totalCents, 90_000)
  assert.equal(summary.ready.invoiceCount, 2)
  assert.equal(summary.approved.invoiceCount, 1)
  assert.equal(summary.sentToFinance.invoiceCount, 3)
  assert.equal(summary.ready.monthCount, 1)
  assert.equal(summary.approved.monthCount, 1)
  assert.equal(summary.sentToFinance.monthCount, 1)
})

test("funnel count caption matches the tile sub-line", () => {
  assert.equal(formatFunnelCountCaption(51, 3), "51 invoices · 3 months")
  assert.equal(formatFunnelCountCaption(1, 1), "1 invoice · 1 month")
})

test("issued/paid/overdue sit in Sent to finance so the three tiles still add up", () => {
  const summary = summariseInvoicingFunnel([
    rec({ total: 10, state: "ready", billing_month: "2026-07" }),
    rec({ total: 20, state: "approved", billing_month: "2026-08" }),
    rec({ total: 30, state: "overdue", billing_month: "2026-09" }),
    rec({ total: 40, state: "drafted", billing_month: "2026-09" }),
  ])
  assert.equal(summary.sentToFinance.cents, 7_000)
  assert.equal(summary.sentToFinance.monthCount, 1)
  assert.equal(summary.ready.monthCount, 1)
  assert.equal(summary.approved.monthCount, 1)
  assert.equal(
    summary.ready.cents + summary.approved.cents + summary.sentToFinance.cents,
    summary.totalCents
  )
})

test("default lifecycle filter is Ready, independent of campaign STATUS", () => {
  assert.equal(DEFAULT_INVOICING_LIFECYCLE_FILTER, "ready")
  assert.equal(recordMatchesLifecycleFilter("ready", "ready"), true)
  assert.equal(recordMatchesLifecycleFilter("approved", "ready"), false)
  assert.equal(recordMatchesLifecycleFilter("approved", "approved"), true)
  assert.equal(recordMatchesLifecycleFilter("ready", "approved"), false)
  assert.equal(recordMatchesLifecycleFilter("sent_to_finance", "sent_to_finance"), true)
  assert.equal(recordMatchesLifecycleFilter("issued", "sent_to_finance"), true)
  assert.equal(recordMatchesLifecycleFilter("paid", "sent_to_finance"), true)
  assert.equal(recordMatchesLifecycleFilter("ready", "all"), true)
  assert.equal(recordMatchesLifecycleFilter("approved", "all"), true)
  assert.equal(recordMatchesLifecycleFilter("overdue", "all"), true)
})
