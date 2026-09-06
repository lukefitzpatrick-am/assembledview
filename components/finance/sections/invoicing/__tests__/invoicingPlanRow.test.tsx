/**
 * CB-8b: one action line per invoicing plan row.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BillingRecord } from "@/lib/types/financeBilling"
import type { MediaPlanGroup } from "@/lib/finance/useReceivablesData"

const approveMock = vi.hoisted(() => vi.fn())
const unapproveMock = vi.hoisted(() => vi.fn())
const unmarkMock = vi.hoisted(() => vi.fn())
const markExportedMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/finance/api", () => ({
  approveBillingRecords: approveMock,
  unapproveBillingRecords: unapproveMock,
  unmarkBillingRecordsExported: unmarkMock,
  markBillingRecordsExported: markExportedMock,
  saveBillingNotes: vi.fn(),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

import { InvoicingPlanRow } from "../InvoicingPlanRow"
import { INVOICING_CLIENT_GRID_CLASS } from "@/lib/finance/sections/invoicingRowPresentation"

function rec(partial: Partial<BillingRecord> = {}): BillingRecord {
  return {
    id: 1,
    clients_id: 1,
    client_name: "BIC",
    billing_type: "media",
    mba_number: "BIC001",
    campaign_name: "Summer",
    billing_month: "2026-07",
    status: "booked",
    total: 2625,
    line_items: [
      {
        id: 1,
        finance_billing_records_id: 1,
        item_code: "SOC",
        line_type: "media",
        media_type: "Social Media",
        description: "Meta",
        publisher_name: null,
        amount: 2625,
        client_pays_media: false,
        sort_order: 0,
      },
    ],
    billed: false,
    invoice_key: "media:BIC001:2026-07",
    po_number: "PO-1",
    ...partial,
  } as BillingRecord
}

const mp: MediaPlanGroup = {
  mbaNumber: "BIC001",
  campaignName: "Summer",
  records: [],
  total: 2625,
  versionId: 10,
  versionNumber: 3,
}

function primaryLabel(container: HTMLElement): string | null {
  const slot = container.querySelector('[data-row-action-slot="primary"]')
  if (!slot) return null
  const btn = slot.querySelector("button")
  return btn?.textContent?.replace(/\s+/g, " ").trim() ?? slot.textContent?.trim() ?? null
}

describe("InvoicingPlanRow primary action", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    approveMock.mockReset()
    unapproveMock.mockReset()
    unmarkMock.mockReset()
    markExportedMock.mockReset()
    toastMock.mockReset()
    approveMock.mockResolvedValue({ ok: true, records: [], errors: [] })
    unapproveMock.mockResolvedValue({ ok: true, records: [], errors: [] })
    vi.spyOn(window, "confirm")
    markExportedMock.mockResolvedValue({
      ok: true,
      exported_by_name: "A",
      records: [],
      skipped: [],
      errors: [],
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it("renders Approve on a Ready row", () => {
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "ready" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
        />,
      )
    })
    expect(primaryLabel(container)).toBe("Approve")
  })

  it("renders Mark sent on an Approved row", () => {
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "approved" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
        />,
      )
    })
    expect(primaryLabel(container)).toBe("Mark sent")
  })

  it("shows Un-approve with a confirm that names client, month and amount", async () => {
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "approved" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
        />,
      )
    })
    const openBtn = [...container.querySelectorAll("button")].find((el) =>
      /Un-approve/i.test(el.textContent ?? ""),
    )
    expect(openBtn).toBeTruthy()
    await act(async () => {
      openBtn!.click()
    })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(document.body.textContent).toMatch(/BIC/)
    expect(document.body.textContent).toMatch(/July 2026/)
    expect(document.body.textContent).toMatch(/\$2,625/)
    expect(unapproveMock).not.toHaveBeenCalled()
  })

  it("calls unapprove on confirm and surfaces a 409 as the reason, not failed", async () => {
    unapproveMock.mockResolvedValue({
      ok: false,
      records: [],
      errors: [
        {
          invoice_key: "media:BIC001:2026-07",
          error: "already_exported",
          status: 409,
        },
      ],
    })
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "approved" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
        />,
      )
    })
    const openBtn = [...container.querySelectorAll("button")].find((el) =>
      /Un-approve/i.test(el.textContent ?? ""),
    )
    await act(async () => {
      openBtn!.click()
    })
    const confirmBtn = [...document.body.querySelectorAll("button")].find(
      (el) => /Un-approve/i.test(el.textContent ?? "") && el !== openBtn,
    )
    expect(confirmBtn).toBeTruthy()
    await act(async () => {
      confirmBtn!.click()
    })
    expect(unapproveMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalled()
    const toastArg = toastMock.mock.calls[0]?.[0] as { title?: string; description?: string }
    expect(String(toastArg?.title ?? "")).not.toMatch(/failed/i)
    expect(`${toastArg?.title ?? ""} ${toastArg?.description ?? ""}`).toMatch(
      /sent to finance|exported/i,
    )
  })

  it("does not offer Un-approve on a sent-to-finance row", () => {
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "sent_to_finance" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
        />,
      )
    })
    expect(container.textContent).not.toMatch(/Un-approve/)
    expect(container.textContent).not.toMatch(/Unapprove/)
  })

  it("approved inline amounts look read-only", () => {
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "approved" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
        />,
      )
    })
    const edit = container.querySelector('[title="Click to edit amount"]')
    expect(edit).toBeNull()
    expect(container.querySelector("[data-amount-frozen]")).not.toBeNull()
  })

  it("renders no primary button on a Sent-to-finance row", () => {
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "sent_to_finance" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
        />,
      )
    })
    expect(container.querySelector('[data-row-action-slot="primary"]')).toBeNull()
    expect(container.textContent).not.toMatch(/\bApprove\b/)
    expect(container.textContent).not.toMatch(/Mark sent/)
  })

  it("demotes the primary button and shows the blocker reason", () => {
    act(() => {
      root.render(
        <InvoicingPlanRow
          record={rec({ state: "ready", po_number: "" })}
          mp={mp}
          kind="media"
          refetch={() => undefined}
          clientMeta={{ abn: "", legalBusinessName: "Ok Co Pty Ltd" }}
        />,
      )
    })
    const btn = container.querySelector('[data-row-action-slot="primary"] button')
    expect(btn).not.toBeNull()
    expect(btn?.textContent?.trim()).toBe("Approve")
    expect(btn?.className).toMatch(/secondary|outline/)
    expect(btn?.className).not.toMatch(/bg-primary(?:\s|$)/)
    expect(container.textContent).toMatch(/missing ABN/)
    const reason = container.querySelector("[data-invoicing-blockers]")
    expect(reason?.className).toMatch(/critical/)
  })

  it("uses the row invoice_key, not records[0]", () => {
    const row = rec({
      invoice_key: "media:BIC001:2026-08",
      billing_month: "2026-08",
      state: "ready",
    })
    act(() => {
      root.render(
        <InvoicingPlanRow record={row} mp={mp} kind="media" refetch={() => undefined} />,
      )
    })
    expect(container.querySelector("[data-invoicing-plan-row]")?.getAttribute("data-invoice-key")).toBe(
      "media:BIC001:2026-08",
    )
  })
})

describe("invoicing client grid breakpoint", () => {
  it("collapses to one column below 700px", () => {
    expect(INVOICING_CLIENT_GRID_CLASS).toMatch(/grid-cols-1/)
    expect(INVOICING_CLIENT_GRID_CLASS).toMatch(/min-\[700px\]:grid-cols-2/)
  })
})
