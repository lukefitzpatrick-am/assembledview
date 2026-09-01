import assert from "node:assert/strict"
import test from "node:test"

import { resolveBillingState, type BillingState } from "../billingLifecycle.js"

/** 1 Sep 2026, 09:00 Australia/Sydney. */
const TODAY = new Date("2026-09-01T09:00:00+10:00")

function resolve(input: {
  approvedAt?: string | null
  exportedAt?: string | null
  xero?: {
    status: string
    amountDue: number
    dueDate: string | null
    fullyPaidDate: string | null
  } | null
  today?: Date
}): { state: BillingState; reason: string } {
  return resolveBillingState({
    approvedAt: input.approvedAt ?? null,
    exportedAt: input.exportedAt ?? null,
    xero: input.xero ?? null,
    today: input.today ?? TODAY,
  })
}

const authorisedOpen = {
  status: "AUTHORISED",
  amountDue: 100,
  dueDate: "2026-09-15",
  fullyPaidDate: null,
}

test("no xero, no export, no approval -> ready", () => {
  const result = resolve({})
  assert.equal(result.state, "ready")
  assert.ok(result.reason.length > 0)
})

test("approvedAt not null -> approved", () => {
  const result = resolve({ approvedAt: "2026-08-20T00:00:00.000Z" })
  assert.equal(result.state, "approved")
})

test("exportedAt not null -> sent_to_finance (wins over approval)", () => {
  const result = resolve({
    approvedAt: "2026-08-20T00:00:00.000Z",
    exportedAt: "2026-08-21T00:00:00.000Z",
  })
  assert.equal(result.state, "sent_to_finance")
})

test("xero DRAFT -> drafted (wins over export/approval)", () => {
  const result = resolve({
    approvedAt: "2026-08-20T00:00:00.000Z",
    exportedAt: "2026-08-21T00:00:00.000Z",
    xero: {
      status: "DRAFT",
      amountDue: 100,
      dueDate: "2026-09-15",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "drafted")
})

test("xero AUTHORISED -> issued", () => {
  const result = resolve({ xero: authorisedOpen })
  assert.equal(result.state, "issued")
})

test("AUTHORISED with dueDate === today is issued, not overdue (boundary)", () => {
  const result = resolve({
    xero: {
      status: "AUTHORISED",
      amountDue: 50,
      dueDate: "2026-09-01",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "issued")
})

test("AUTHORISED, dueDate < today, amountDue > 0 -> overdue", () => {
  const result = resolve({
    xero: {
      status: "AUTHORISED",
      amountDue: 50,
      dueDate: "2026-08-31",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "overdue")
})

test("xero status PAID -> paid", () => {
  const result = resolve({
    xero: {
      status: "PAID",
      amountDue: 10,
      dueDate: "2026-08-01",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "paid")
})

test("amountDue exactly 0 on an AUTHORISED invoice is paid", () => {
  const result = resolve({
    xero: {
      status: "AUTHORISED",
      amountDue: 0,
      dueDate: "2026-08-01",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "paid")
})

test("fullyPaidDate set -> paid", () => {
  const result = resolve({
    xero: {
      status: "AUTHORISED",
      amountDue: 80,
      dueDate: "2026-08-01",
      fullyPaidDate: "2026-08-20",
    },
  })
  assert.equal(result.state, "paid")
})

test("VOIDED falls through to export", () => {
  const result = resolve({
    exportedAt: "2026-08-21T00:00:00.000Z",
    xero: {
      status: "VOIDED",
      amountDue: 0,
      dueDate: "2026-08-01",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "sent_to_finance")
})

test("VOIDED with no export falls through to approval", () => {
  const result = resolve({
    approvedAt: "2026-08-20T00:00:00.000Z",
    xero: {
      status: "VOIDED",
      amountDue: 0,
      dueDate: "2026-08-01",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "approved")
})

test("DELETED falls through to ready when no export or approval", () => {
  const result = resolve({
    xero: {
      status: "DELETED",
      amountDue: 0,
      dueDate: "2026-08-01",
      fullyPaidDate: null,
    },
  })
  assert.equal(result.state, "ready")
})

test("DELETED falls through to export", () => {
  const result = resolve({
    exportedAt: "2026-08-21T00:00:00.000Z",
    approvedAt: "2026-08-20T00:00:00.000Z",
    xero: {
      status: "DELETED",
      amountDue: 99,
      dueDate: "2026-08-01",
      fullyPaidDate: "2026-08-02",
    },
  })
  assert.equal(result.state, "sent_to_finance")
})
