/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money"

import type { ClientInvoiceTableRow, ClientInvoicesReady } from "../ClientInvoicesSection"
import { ClientOverdueNotice } from "../ClientOverdueNotice"

function invoice(
  n: number,
  state: ClientInvoiceTableRow["state"],
  dueDate: string,
): ClientInvoiceTableRow {
  return {
    xeroInvoiceId: `id-${n}`,
    invoiceNumber: `INV-${n}`,
    issueDate: "2026-07-01",
    dueDate,
    totalCents: 110000,
    amountPaidCents: 0,
    hasPdf: false,
    state,
  }
}

function ready(
  invoices: ClientInvoiceTableRow[],
  overdueCount: number,
  overdueCents: number,
): ClientInvoicesReady {
  return {
    invoices,
    summary: { outstandingCents: overdueCents, overdueCents, overdueCount },
  }
}

describe("ClientOverdueNotice", () => {
  it("renders nothing when nothing is overdue", () => {
    const html = renderToStaticMarkup(
      <ClientOverdueNotice
        data={ready([invoice(1, "due", "2026-10-20")], 0, 0)}
        accountsContactEmail="accounts@example.com"
      />,
    )
    expect(html).toBe("")
  })

  it("uses the single-invoice sentence and the Sydney civil date", () => {
    const cents = 110000
    const html = renderToStaticMarkup(
      <ClientOverdueNotice
        data={ready([invoice(1, "overdue", "2026-09-01")], 1, cents)}
        accountsContactEmail={null}
      />,
    )
    const amount = formatMoney(fromCents(cents))
    expect(html).toContain(`Invoice INV-1 for ${amount} was due on 1 September 2026.`)
    expect(html.includes("If you've already paid")).toBe(false)
    expect(html).toContain('href="#client-invoices"')
    expect(html).toContain("View invoices")
  })

  it("totals several overdue invoices", () => {
    const cents = 330000
    const html = renderToStaticMarkup(
      <ClientOverdueNotice
        data={ready(
          [
            invoice(1, "overdue", "2026-08-01"),
            invoice(2, "overdue", "2026-08-15"),
            invoice(3, "overdue", "2026-09-01"),
          ],
          3,
          cents,
        )}
      />,
    )
    const amount = formatMoney(fromCents(cents))
    expect(html).toContain(`${3} invoices totalling ${amount} are past their due date.`)
    expect(html.includes("was due on")).toBe(false)
  })

  it("adds the contact sentence only when an address is set", () => {
    const data = ready([invoice(1, "overdue", "2026-09-01")], 1, 110000)
    const withEmail = renderToStaticMarkup(
      <ClientOverdueNotice data={data} accountsContactEmail=" accounts@example.com " />,
    )
    const withoutEmail = renderToStaticMarkup(
      <ClientOverdueNotice data={data} accountsContactEmail="  " />,
    )
    expect(withEmail).toContain(
      "If you&#x27;ve already paid, thank you. Questions: accounts@example.com.",
    )
    expect(withoutEmail.includes("Questions:")).toBe(false)
    expect(withoutEmail.includes("already paid")).toBe(false)
  })
})
