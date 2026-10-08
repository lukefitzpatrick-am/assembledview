/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money"

import {
  ClientInvoicesSection,
  clientInvoicesViewFromHttp,
  type ClientInvoiceTableRow,
} from "../ClientInvoicesSection"

function row(
  n: number,
  state: ClientInvoiceTableRow["state"],
  hasPdf: boolean,
): ClientInvoiceTableRow {
  return {
    xeroInvoiceId: `id-${n}`,
    invoiceNumber: `INV-${n}`,
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    totalCents: 110000,
    amountPaidCents: state === "paid" ? 110000 : 0,
    hasPdf,
    state,
  }
}

describe("ClientInvoicesSection", () => {
  it("renders a loading section without an amount", () => {
    const html = renderToStaticMarkup(<ClientInvoicesSection view={{ status: "loading" }} />)
    expect(html).toContain("Invoices.")
    expect(html).toContain('aria-busy="true"')
    expect(html.includes("$")).toBe(false)
  })

  it("renders the empty state", () => {
    const html = renderToStaticMarkup(
      <ClientInvoicesSection
        view={{ status: "ready", data: { invoices: [], summary: { outstandingCents: 0 } } }}
      />,
    )
    expect(html).toContain("Invoices.")
    expect(html).toContain("No invoices yet.")
    expect(html.includes("$")).toBe(false)
  })

  it("renders rows, the inc GST summary, a PDF only when one exists, and Show all after 10", () => {
    const invoices = [
      row(1, "overdue", true),
      row(2, "due", false),
      ...Array.from({ length: 9 }, (_, index) => row(index + 3, "paid", false)),
    ]
    const html = renderToStaticMarkup(
      <ClientInvoicesSection
        view={{
          status: "ready",
          data: { invoices, summary: { outstandingCents: 220000 } },
        }}
      />,
    )
    const amount = formatMoney(fromCents(220000))
    expect(html).toContain(`2 outstanding, ${amount} due. Amounts include GST.`)
    expect(html).toContain("Overdue")
    expect(html).toContain("Due")
    expect(html).toContain("Paid")
    expect(html).toContain("INV-1")
    expect(html).toContain("INV-10")
    expect(html.includes("INV-11")).toBe(false)
    expect(html).toContain("Show all")
    expect(html).toContain('aria-label="Invoice INV-1"')
    expect(html.includes('aria-label="Invoice INV-2"')).toBe(false)
  })

  it("renders the error state without a zero amount", () => {
    const html = renderToStaticMarkup(<ClientInvoicesSection view={{ status: "error" }} />)
    expect(html).toContain("Could not load invoices")
    expect(html).toContain("Invoices.")
    expect(html.includes("$")).toBe(false)
    expect(html.includes("0.00")).toBe(false)
  })

  it("hides the section when the invoices API returns 404", () => {
    const view = clientInvoicesViewFromHttp(404, { error: "not found" })
    const html = renderToStaticMarkup(<ClientInvoicesSection view={view} />)
    expect(view.status).toBe("hidden")
    expect(html).toBe("")
  })
})
