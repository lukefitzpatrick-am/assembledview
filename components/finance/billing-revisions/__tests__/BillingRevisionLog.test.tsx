/**
 * Billing changes log with Undo (billing revisions C9). Luke runs this
 * with vitest (it is in vitest.config.ts include).
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BillingRevisionLog } from "@/components/finance/billing-revisions/BillingRevisionLog"

const ROWS = [
  {
    id: 2,
    createdAt: "2026-10-26T06:00:00Z",
    mbaNumber: "PENFOLD020",
    mode: "bill_amount",
    reason: "Client asked",
    source: "ava",
    status: "applied",
    createdByName: "Luke",
    baseVersionNumber: 29,
    newVersionNumber: 30,
    movedCents: 10_000_000,
    restoresRevisionId: null,
    diff: { months: [{ month: "2026-10", total: { before: 1_416_067, after: 11_416_067 } }], lines: [], credits: [] },
  },
]

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
}

describe("BillingRevisionLog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function flush() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it("lists the revision and shows 'cannot undo' when a month was invoiced since", async () => {
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("/undo")) {
        return json(
          { ok: false, code: "NO_CHANGE", message: "Nothing can be undone.", plan: { cannotUndo: [{ lineItemId: "PENFOLD020DV1", months: ["2026-10"] }] } },
          422,
        )
      }
      return json({ ok: true, revisions: ROWS })
    }) as unknown as typeof fetch
    await act(async () => {
      root.render(<BillingRevisionLog open onOpenChange={() => {}} mbaNumber="PENFOLD020" fetchImpl={fetchImpl} />)
    })
    await flush()
    const item = document.querySelector('[data-revision-id="2"]')
    expect(item?.textContent).toContain("v29 → v30")
    expect(item?.textContent).toContain("$100,000.00")
    const undo = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Undo"))!
    await act(async () => undo.click())
    await flush()
    expect(document.querySelector("[data-undo-error]")?.textContent).toContain("PENFOLD020DV1: cannot undo 2026-10")
  })
})
