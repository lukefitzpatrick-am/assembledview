/**
 * Row actions: Un-mark on sent_to_finance; reapprove on drifted approved.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BillingRecord } from "@/lib/types/financeBilling"

const approveMock = vi.hoisted(() => vi.fn())
const unapproveMock = vi.hoisted(() => vi.fn())
const unmarkMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/finance/api", () => ({
  approveBillingRecords: approveMock,
  unapproveBillingRecords: unapproveMock,
  unmarkBillingRecordsExported: unmarkMock,
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

import { ReceivableApproveButton } from "../ReceivableApproveButton"

function rec(partial: Partial<BillingRecord>): BillingRecord {
  return {
    id: 1,
    clients_id: 1,
    client_name: "Acme",
    billing_type: "media",
    mba_number: "X001",
    campaign_name: "Camp",
    billing_month: "2026-07",
    status: "booked",
    total: 100,
    line_items: [],
    billed: false,
    invoice_key: "media:X001:2026-07",
    ...partial,
  } as BillingRecord
}

describe("ReceivableApproveButton", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    approveMock.mockReset()
    unapproveMock.mockReset()
    unmarkMock.mockReset()
    toastMock.mockReset()
    approveMock.mockResolvedValue({ ok: true, records: [], errors: [] })
    unapproveMock.mockResolvedValue({ ok: true, records: [] })
    unmarkMock.mockResolvedValue({ ok: true, records: [] })
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

  function labels(): string[] {
    return [...container.querySelectorAll("button")].map((el) => el.textContent?.trim() ?? "")
  }

  it("shows Un-mark on a sent-to-finance row and does not unapprove", async () => {
    act(() => {
      root.render(<ReceivableApproveButton record={rec({ state: "sent_to_finance" })} />)
    })
    expect(labels()).toContain("Un-mark")
    expect(labels()).not.toContain("Unapprove")
    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((el) => el.textContent?.trim() === "Un-mark")!
        .click()
    })
    expect(unmarkMock).toHaveBeenCalledWith({ invoice_keys: ["media:X001:2026-07"] })
    expect(unapproveMock).not.toHaveBeenCalled()
  })

  it("wires reapprove: true on a drifted approved row", async () => {
    act(() => {
      root.render(
        <ReceivableApproveButton record={rec({ state: "approved", approved_drift: true })} />
      )
    })
    expect(labels()).toContain("Re-approve at the current amount")
    expect(labels()).toContain("Unapprove")
    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((el) => el.textContent?.trim() === "Re-approve at the current amount")!
        .click()
    })
    expect(approveMock).toHaveBeenCalledWith({
      invoice_keys: ["media:X001:2026-07"],
      billing_month: "2026-07",
      reapprove: true,
    })
  })
})
