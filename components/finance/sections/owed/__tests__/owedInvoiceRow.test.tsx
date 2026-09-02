/**
 * CB-8e: Owed stays a table; shared pill / document / ⋯ vocabulary.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BillingStateBadge } from "@/components/finance/BillingStateBadge"
import { OwedInvoiceRow } from "../OwedInvoiceRow"
import type { OwedLedgerRow } from "@/lib/finance/sections/owedLedger"
import { arInvoicePdfPath } from "@/lib/finance/invoices/invoicePdfPaths"

function row(partial: Partial<OwedLedgerRow> = {}): OwedLedgerRow {
  return {
    invoiceKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    invoiceNumber: "INV-1",
    reference: null,
    issueDate: "2026-06-01",
    dueDate: "2026-06-26",
    clientName: "BIC",
    clientsId: 1,
    resolved: true,
    group: "client",
    contactName: "BIC Pty Ltd",
    totalCents: 10000,
    paidCents: 0,
    outstandingCents: 10000,
    daysOverdue: 68,
    bucket: "d60_plus",
    state: "overdue",
    pdfAvailable: false,
    ...partial,
  }
}

function mount(): HTMLDivElement {
  const wrap = document.createElement("div")
  document.body.appendChild(wrap)
  return wrap
}

describe("OwedInvoiceRow", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = mount()
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function renderRow(r: OwedLedgerRow) {
    act(() => {
      root.render(
        <table>
          <tbody>
            <OwedInvoiceRow row={r} />
          </tbody>
        </table>,
      )
    })
  }

  it("a row without a PDF renders no download control at all", () => {
    renderRow(row({ pdfAvailable: false }))
    const pdfCell = container.querySelector("[data-owed-pdf]")
    expect(pdfCell).not.toBeNull()
    expect(pdfCell?.querySelector("a")).toBeNull()
    expect(pdfCell?.querySelector("button")).toBeNull()
    expect(pdfCell?.textContent).not.toMatch(/coming soon/i)
    expect(pdfCell?.textContent?.replace(/\s+/g, "")).toBe("")
    expect(container.querySelector(`[href="${arInvoicePdfPath(row().invoiceKey)}"]`)).toBeNull()
  })

  it("the pill values and colours match the card tabs for the same state", () => {
    act(() => {
      root.render(
        <div>
          <div data-card-pills="">
            <BillingStateBadge state="issued" />
            <BillingStateBadge state="overdue" />
            <BillingStateBadge state="paid" />
          </div>
          <table>
            <tbody>
              <OwedInvoiceRow row={row({ state: "issued", daysOverdue: 0, bucket: "not_yet_due" })} />
            </tbody>
          </table>
        </div>,
      )
    })
    const cardIssued = container.querySelector('[data-card-pills] [data-billing-state="issued"]')
    const owedIssued = container.querySelector('[data-owed-state] [data-billing-state="issued"]')
    expect(cardIssued).not.toBeNull()
    expect(owedIssued).not.toBeNull()
    expect(owedIssued?.className).toBe(cardIssued?.className)
    expect(owedIssued?.textContent).toBe(cardIssued?.textContent)

    act(() => {
      root.render(
        <div>
          <div data-card-pills="">
            <BillingStateBadge state="overdue" />
          </div>
          <table>
            <tbody>
              <OwedInvoiceRow row={row({ state: "overdue", daysOverdue: 68 })} />
            </tbody>
          </table>
        </div>,
      )
    })
    const cardOverdue = container.querySelector('[data-card-pills] [data-billing-state="overdue"]')
    const owedOverdue = container.querySelector('[data-owed-state] [data-billing-state="overdue"]')
    expect(cardOverdue?.className).toBe(owedOverdue?.className)
    expect(cardOverdue?.textContent).toBe("Overdue")
    expect(owedOverdue?.textContent).toBe("Overdue 68d")
  })

  it("renders no primary button and no dunning action", () => {
    renderRow(row())
    expect(container.querySelector('[data-row-action-slot="primary"]')).toBeNull()
    expect(container.textContent).not.toMatch(/remind|chase|dunn/i)
    expect(container.querySelector("tr")).not.toBeNull()
    expect(container.querySelector("[data-invoicing-client-card], article")).toBeNull()
  })
})
