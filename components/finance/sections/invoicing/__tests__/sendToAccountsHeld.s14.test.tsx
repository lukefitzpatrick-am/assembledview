/**
 * S14 A: the Send to accounts dialog lists invoices held above plan, the
 * amount above plan, and a labelled reason form. Storing a reason reloads the
 * preview. Held invoices are not counted in the pack.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SendToAccountsButton } from "../SendToAccountsButton"

const hold = {
  invoiceKey: "media:AC-001:2026-05",
  persistedId: 11,
  clientName: "Acme",
  mbaNumber: "AC-001",
  billingMonth: "2026-05",
  toBillCents: 100000,
  planMonthCents: 100000,
  planTotalCents: 150000,
  billedMonthCents: 0,
  billedTotalCents: 80000,
  abovePlanCents: 30000,
  reason: { reason: "Earlier overage", coversCents: 1000, byName: "Luke", at: "2026-11-01" },
}
const preview = (held: unknown[]) => ({
  fy: 2026,
  month: "2026-05",
  monthLabel: "May 2026",
  rows: [],
  totalsByType: { media: { count: 0, total: 0 }, sow: { count: 0, total: 0 }, retainer: { count: 0, total: 0 } },
  invoiceCount: 0,
  totalExGst: 0,
  blockers: [],
  held,
})

describe("SendToAccountsButton held above plan", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ ok: true, covers_cents: 30000 }), { status: 200 })
      const held = fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "POST") ? [] : [hold]
      return new Response(JSON.stringify(preview(held)), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  async function open() {
    act(() => {
      root.render(<SendToAccountsButton fy={2026} month="2026-05" monthLabel="May 2026" onSent={() => undefined} />)
    })
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Send to accounts")!
    await act(async () => {
      btn.click()
    })
  }

  it("shows the hold, the amount above plan, the figures and the last reason", async () => {
    await open()
    const text = document.body.textContent ?? ""
    expect(text).toContain("Held above plan · 1 not in this pack")
    expect(text).toContain("Acme (AC-001): $300.00 above plan")
    expect(text).toContain("invoiced so far $800.00")
    expect(text).toContain("plan $1,500.00")
    expect(text).toContain("The last reason covered $10.00: Earlier overage (Luke)")
    expect(text).toContain("0 invoices")
  })

  it("the reason field has a label, is required, and storing it posts the key and reloads the preview", async () => {
    await open()
    const field = document.body.querySelector("textarea")!
    const label = document.body.querySelector(`label[for="${field.id}"]`)
    expect(label?.textContent).toBe("Finance reason for Acme (AC-001)")
    expect(field.required).toBe(true)
    expect(field.maxLength).toBe(2000)
    const submit = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Store reason and include")!
    expect(submit.disabled).toBe(true)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(field, "Client agreed")
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(submit.disabled).toBe(false)
    await act(async () => {
      submit.click()
    })
    const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST")!
    expect(post[0]).toBe("/api/finance/billing/above-plan-reason")
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      month: "2026-05",
      invoice_key: "media:AC-001:2026-05",
      reason: "Client agreed",
      // The amount the admin saw: the server stores nothing if its amount is higher.
      seen_cents: 30000,
    })
    expect(document.body.textContent).not.toContain("Held above plan")
  })

  it("a refused reason shows as an alert tied to the field", async () => {
    await open()
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ message: "This invoice is not held above plan." }), { status: 409 }))
    const field = document.body.querySelector("textarea")!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(field, "x")
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      ;[...document.body.querySelectorAll("button")].find((b) => b.textContent === "Store reason and include")!.click()
    })
    const alert = document.body.querySelector("[role=alert]")!
    expect(alert.textContent).toBe("This invoice is not held above plan.")
    expect(field.getAttribute("aria-describedby")).toBe(alert.id)
    expect(field.getAttribute("aria-invalid")).toBe("true")
  })
})
