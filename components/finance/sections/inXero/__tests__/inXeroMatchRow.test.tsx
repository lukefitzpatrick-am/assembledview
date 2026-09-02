/**
 * CB-8d: In Xero row actions + outcome grouping.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { InXeroMatchRow } from "../InXeroMatchRow"
import { InXeroOutcomeList } from "../InXeroOutcomeSection"
import type { DraftMatchGrouped, DraftMatchRow } from "@/lib/finance/sections/draftMatch"

function row(partial: Partial<DraftMatchRow> & Pick<DraftMatchRow, "id" | "outcome">): DraftMatchRow {
  return {
    clients_id: 1,
    client_name: "BIC",
    billing_month: "2026-07",
    approved_amount_cents: 291666,
    xero_amount_cents: 300000,
    delta_cents: 8334,
    approved: [
      {
        invoice_key: "media:BIC001:2026-07",
        clients_id: 1,
        client_name: "BIC",
        mba_number: "BIC001",
        billing_month: "2026-07",
        approved_amount_cents: 291666,
      },
    ],
    drafts: [
      {
        xero_invoice_id: "x-1",
        invoice_number: "INV-1",
        reference_raw: "BIC001",
        sub_total_cents: 300000,
        xero_url: "https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=x-1",
      },
    ],
    stamps: [],
    ...partial,
  }
}

const noopAssign = {
  assignClient: {},
  assignMba: {},
  assignKey: {},
  setAssignClient: () => undefined,
  setAssignMba: () => undefined,
  setAssignKey: () => undefined,
}

function primaryLabel(container: HTMLElement): string | null {
  const slot = container.querySelector('[data-row-action-slot="primary"]')
  if (!slot) return null
  const btn = slot.querySelector("button")
  return btn?.textContent?.replace(/\s+/g, " ").trim() ?? slot.textContent?.trim() ?? null
}

describe("InXeroMatchRow primary action", () => {
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

  it("renders Accept Xero figure on Differs", () => {
    act(() => {
      root.render(
        <InXeroMatchRow
          row={row({ id: "d", outcome: "Differs" })}
          candidates={[]}
          mbaOptions={[]}
          busy={false}
          setAssignClient={() => undefined}
          setAssignMba={() => undefined}
          setAssignKey={() => undefined}
          onAccept={() => undefined}
          onAssign={() => undefined}
        />,
      )
    })
    expect(primaryLabel(container)).toBe("Accept Xero figure")
  })

  it("renders no primary on Missing", () => {
    act(() => {
      root.render(
        <InXeroMatchRow
          row={row({ id: "m", outcome: "Missing", drafts: [] })}
          candidates={[]}
          mbaOptions={[]}
          busy={false}
          setAssignClient={() => undefined}
          setAssignMba={() => undefined}
          setAssignKey={() => undefined}
          onAccept={() => undefined}
          onAssign={() => undefined}
        />,
      )
    })
    expect(container.querySelector('[data-row-action-slot="primary"]')).toBeNull()
    expect(container.querySelector('[data-row-action-slot="menu"]')).not.toBeNull()
  })

  it("renders Assign on Extra", () => {
    act(() => {
      root.render(
        <InXeroMatchRow
          row={row({ id: "e", outcome: "Extra", approved: [] })}
          candidates={[]}
          mbaOptions={[]}
          busy={false}
          setAssignClient={() => undefined}
          setAssignMba={() => undefined}
          setAssignKey={() => undefined}
          onAccept={() => undefined}
          onAssign={() => undefined}
        />,
      )
    })
    expect(primaryLabel(container)).toBe("Assign")
  })
})

describe("InXeroOutcomeList grouping", () => {
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

  it("renders outcomes in exception-first order with Agrees collapsed last", () => {
    const grouped: DraftMatchGrouped = {
      Differs: [row({ id: "d", outcome: "Differs" })],
      Missing: [row({ id: "m", outcome: "Missing", drafts: [] })],
      Extra: [row({ id: "e", outcome: "Extra", approved: [] })],
      Agrees: [row({ id: "a", outcome: "Agrees", delta_cents: 0, xero_amount_cents: 291666 })],
    }
    act(() => {
      root.render(
        <InXeroOutcomeList
          grouped={grouped}
          candidates={[]}
          mbaOptions={[]}
          busyId={null}
          assign={noopAssign}
          onAccept={() => undefined}
          onAssign={() => undefined}
        />,
      )
    })
    const sections = [...container.querySelectorAll("[data-outcome-section]")].map((el) =>
      el.getAttribute("data-outcome-section")
    )
    expect(sections).toEqual(["Differs", "Missing", "Extra", "Agrees"])
    const agrees = container.querySelector('[data-outcome-section="Agrees"]')
    expect(agrees?.getAttribute("data-collapsed")).toBe("true")
    const differs = container.querySelector('[data-outcome-section="Differs"]')
    expect(differs?.getAttribute("data-collapsed")).toBe("false")
  })
})
