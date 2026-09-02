/**
 * CB-8a: finance row action grammar primitives (unmounted).
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InvoiceDocumentButton } from "@/components/finance/InvoiceDocumentButton"
import { RowActionLine } from "@/components/finance/RowActionLine"
import { RowActionMenu } from "@/components/finance/RowActionMenu"
import { arInvoicePdfPath } from "@/lib/finance/invoices/invoicePdfPaths"

describe("InvoiceDocumentButton", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("returns null when the PDF is unavailable", () => {
    act(() => {
      root.render(
        <InvoiceDocumentButton
          xeroInvoiceId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
          invoiceNumber="INV-1"
          available={false}
        />,
      )
    })
    expect(container.innerHTML).toBe("")
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).not.toMatch(/coming soon/i)
  })

  it("links a labelled Invoice control to the AR proxy when available", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    act(() => {
      root.render(
        <InvoiceDocumentButton xeroInvoiceId={id} invoiceNumber="INV-1" available />,
      )
    })
    const link = container.querySelector("a")
    expect(link).not.toBeNull()
    expect(link?.getAttribute("href")).toBe(arInvoicePdfPath(id))
    expect(link?.textContent).toContain("Invoice")
    expect(link?.hasAttribute("disabled")).toBe(false)
  })
})

describe("RowActionLine", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("renders slots in pill → context → spacer → primary → document → menu order regardless of prop order", () => {
    act(() => {
      root.render(
        <RowActionLine
          menuItems={[{ label: "Notes", onSelect: () => undefined }]}
          document={<span data-testid="doc">📄 Invoice</span>}
          primary={<button type="button">Approve</button>}
          context="due 3 Sep"
          state="ready"
        />,
      )
    })
    const line = container.querySelector("[data-row-action-line]")
    expect(line).not.toBeNull()
    const slots = [...(line?.children ?? [])].map((el) =>
      (el as HTMLElement).dataset.rowActionSlot,
    )
    expect(slots).toEqual(["pill", "context", "spacer", "primary", "document", "menu"])
    expect(line?.querySelector('[data-row-action-slot="pill"]')?.textContent).toMatch(/Ready/)
  })
})

describe("RowActionMenu", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps a disabled item visible and exposes its reason", async () => {
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <RowActionMenu
          items={[
            {
              label: "Unapprove",
              onSelect,
              disabled: true,
              disabledReason: "Already sent to finance",
            },
          ]}
        />,
      )
    })

    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false
      Element.prototype.setPointerCapture = () => undefined
      Element.prototype.releasePointerCapture = () => undefined
    }

    const trigger = container.querySelector("button")
    expect(trigger).not.toBeNull()
    await act(async () => {
      trigger!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      trigger!.click()
    })

    const item = document.body.querySelector('[role="menuitem"]')
    expect(item).not.toBeNull()
    expect(item?.textContent).toContain("Unapprove")
    expect(item?.getAttribute("aria-disabled")).toBe("true")
    const reasonHost =
      item?.closest("[title]") ?? item
    expect(reasonHost?.getAttribute("title")).toBe("Already sent to finance")
    act(() => {
      ;(item as HTMLElement).click()
    })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
