import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { dollarsToCents } from "@/lib/xero/money"

import {
  assembleClientInvoices,
  clientInvoiceState,
  isClientInvoicesEnabled,
  type ClientInvoiceCandidate,
} from "../clientInvoices"

function candidate(
  partial: Partial<ClientInvoiceCandidate> & Pick<ClientInvoiceCandidate, "xeroInvoiceId" | "status">,
): ClientInvoiceCandidate {
  return {
    invoiceNumber: partial.xeroInvoiceId,
    issueDate: "2026-08-01",
    dueDate: "2026-08-15",
    fullyPaidDate: null,
    total: 110,
    amountDue: 110,
    amountPaid: 0,
    mbaNumber: null,
    pdfFile: null,
    contactName: "Acme",
    xeroContactId: "contact-1",
    ...partial,
  }
}

describe("isClientInvoicesEnabled", () => {
  it("defaults off", () => {
    const off = { NODE_ENV: "test" } as NodeJS.ProcessEnv
    const explicitOff = { NODE_ENV: "test", CLIENT_INVOICES_ENABLED: "off" } as NodeJS.ProcessEnv
    const on = { NODE_ENV: "test", CLIENT_INVOICES_ENABLED: "on" } as NodeJS.ProcessEnv
    assert.equal(isClientInvoicesEnabled(off), false)
    assert.equal(isClientInvoicesEnabled(explicitOff), false)
    assert.equal(isClientInvoicesEnabled(on), true)
  })
})

describe("assembleClientInvoices", () => {
  const today = "2026-10-08"

  it("drops a fuzzy-only invoice and a draft, and keeps this client's strict match", () => {
    const rows = [
      candidate({ xeroInvoiceId: "fuzzy", status: "AUTHORISED", invoiceNumber: "F-1" }),
      candidate({ xeroInvoiceId: "draft", status: "DRAFT", invoiceNumber: "D-1" }),
      candidate({
        xeroInvoiceId: "mine",
        status: "AUTHORISED",
        invoiceNumber: "M-1",
        dueDate: today,
        total: 110,
        amountDue: 110,
        pdfFile: { url: "https://blob.example/mine.pdf" },
      }),
      candidate({ xeroInvoiceId: "theirs", status: "PAID", invoiceNumber: "T-1", amountDue: 0 }),
    ]
    const payload = assembleClientInvoices({
      rows,
      clientIds: [null, 7, 7, 9],
      clientId: 7,
      todayYmd: today,
    })
    assert.deepEqual(
      payload.invoices.map((row) => row.xeroInvoiceId),
      ["mine"],
    )
    assert.equal(payload.totalBasis, "inc_gst")
    assert.equal(payload.invoices[0]?.totalCents, dollarsToCents(110))
    assert.equal(payload.invoices[0]?.hasPdf, true)
    assert.equal(payload.invoices[0]?.state, "due")
    assert.equal(payload.invoices[0]?.daysOverdue, 0)
    assert.equal("rawJson" in (payload.invoices[0] ?? {}), false)
  })

  it("orders overdue oldest first, then due soonest, then paid newest", () => {
    const rows = [
      candidate({
        xeroInvoiceId: "paid-old",
        status: "PAID",
        issueDate: "2026-07-02",
        amountDue: 0,
        amountPaid: 110,
        fullyPaidDate: "2026-07-20",
      }),
      candidate({
        xeroInvoiceId: "due-soon",
        status: "AUTHORISED",
        dueDate: "2026-10-20",
      }),
      candidate({
        xeroInvoiceId: "overdue-new",
        status: "AUTHORISED",
        dueDate: "2026-09-01",
      }),
      candidate({
        xeroInvoiceId: "paid-new",
        status: "PAID",
        issueDate: "2026-09-15",
        amountDue: 0,
        amountPaid: 50,
        total: 50,
      }),
      candidate({
        xeroInvoiceId: "overdue-old",
        status: "AUTHORISED",
        dueDate: "2026-08-01",
        amountDue: 40,
        total: 40,
      }),
      candidate({
        xeroInvoiceId: "due-later",
        status: "AUTHORISED",
        dueDate: "2026-11-01",
      }),
    ]
    const payload = assembleClientInvoices({
      rows,
      clientIds: [7, 7, 7, 7, 7, 7],
      clientId: 7,
      todayYmd: today,
    })
    assert.deepEqual(
      payload.invoices.map((row) => row.xeroInvoiceId),
      ["overdue-old", "overdue-new", "due-soon", "due-later", "paid-new", "paid-old"],
    )
    assert.equal(payload.summary.overdueCount, 2)
    assert.equal(payload.summary.oldestOverdueDueDate, "2026-08-01")
    assert.equal(
      payload.summary.overdueCents,
      dollarsToCents(40) + dollarsToCents(110),
    )
    assert.equal(
      payload.summary.outstandingCents,
      payload.summary.overdueCents + dollarsToCents(110) + dollarsToCents(110),
    )
  })

  it("due today in Sydney is not overdue, and the day before is", () => {
    const stillToday = new Date("2026-10-07T12:30:00.000Z")
    const nextSydneyDay = new Date("2026-10-07T13:30:00.000Z")
    const sydneyToday = sydneyCivilParts(stillToday).ymd
    const sydneyTomorrow = sydneyCivilParts(nextSydneyDay).ymd
    assert.equal(sydneyToday, "2026-10-07")
    assert.equal(sydneyTomorrow, "2026-10-08")

    const dueToday = clientInvoiceState("AUTHORISED", 100, sydneyToday, sydneyToday)
    assert.equal(dueToday.state, "due")
    assert.equal(dueToday.daysOverdue, 0)

    const overdue = clientInvoiceState("AUTHORISED", 100, sydneyToday, sydneyTomorrow)
    assert.equal(overdue.state, "overdue")
    assert.equal(overdue.daysOverdue, 1)

    const paid = clientInvoiceState("PAID", 0, "2026-01-01", sydneyTomorrow)
    assert.equal(paid.state, "paid")
    assert.equal(paid.daysOverdue, 0)
  })
})
