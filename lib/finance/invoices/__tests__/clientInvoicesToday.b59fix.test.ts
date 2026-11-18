/**
 * B59fix (review R3, C-277): the client dashboard invoices list ages
 * invoices to the Melbourne day from the app clock, never a database clock
 * or the UTC day. `loadClientInvoicesForClient` runs only on the server, so
 * this file runs in UTC with the clock mocked where the UTC day is the day
 * before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 * One open invoice falls due on the UTC day: one day overdue on the
 * Melbourne day, still due on the UTC day. The database answers only the
 * invoice query, so a "today" read from it shows here too.
 */
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", utcDay: "2026-11-30", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", utcDay: "2026-06-30", label: "1 Jul 07:00 AEST" },
] as const

let dueDate = ""
const execute = mock.fn(async () => [
  {
    xero_invoice_id: "inv-1",
    invoice_number: "INV-1",
    issue_date: "2026-01-15",
    due_date: dueDate,
    fully_paid_date: null,
    status: "AUTHORISED",
    total: 110,
    amount_due: 110,
    amount_paid: 0,
    mba_number: null,
    pdf_file: null,
    xero_contact_id: "contact-1",
    contact_name: "Acme",
  },
])
if (typeof mock.module === "function") {
  await mock.module("@/db", { namedExports: { db: { execute }, getDb: () => ({ execute }) } })
  await mock.module("@/lib/finance/invoices/resolveInvoiceClient", {
    namedExports: {
      resolveInvoiceClients: async (rows: unknown[]) => rows.map(() => ({ clientId: 7 })),
    },
  })
}

for (const { at, utcDay, label } of INSTANTS) {
  test(`client invoices age to the Melbourne day (${label})`, { skip: mockModuleSkip() }, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    dueDate = utcDay
    execute.mock.resetCalls()
    const { loadClientInvoicesForClient } = await import("@/lib/finance/invoices/clientInvoices")
    const out = await loadClientInvoicesForClient(7)
    assert.equal(execute.mock.callCount(), 1, "one round trip: the invoices, no database clock")
    assert.equal(out.invoices.length, 1)
    assert.equal(out.invoices[0]?.state, "overdue")
    assert.equal(out.invoices[0]?.daysOverdue, 1)
    assert.equal(out.summary.overdueCount, 1)
  })
}
