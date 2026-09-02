/**
 * Per-month bulk approve — AlertDialog names count and amount; never window.confirm.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatAUD } from "@/lib/format/money"
import { invoicingBulkApproveConfirmCopy } from "@/lib/finance/sections/invoicingBulkApproveCopy"
import { BulkApproveReadyButton } from "../BulkApproveReadyButton"

describe("BulkApproveReadyButton", () => {
  let container: HTMLDivElement
  let root: Root
  const onConfirm = vi.fn()

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    onConfirm.mockReset()
    onConfirm.mockResolvedValue(undefined)
    vi.spyOn(window, "confirm")
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

  it("opens a confirm that names the count and amount", async () => {
    const copy = invoicingBulkApproveConfirmCopy({
      count: 8,
      amountDollars: 12_345,
      monthLabel: "July 2026",
    })
    act(() => {
      root.render(
        <BulkApproveReadyButton
          count={8}
          amountDollars={12_345}
          monthLabel="July 2026"
          onConfirm={onConfirm}
        />
      )
    })
    const openBtn = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Approve ready")
    )
    expect(openBtn).toBeTruthy()
    await act(async () => {
      openBtn!.click()
    })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(copy.title)
    expect(document.body.textContent).toContain("8 invoices")
    expect(document.body.textContent).toContain(formatAUD(12_345))
    expect(onConfirm).not.toHaveBeenCalled()
    const confirmBtn = [...document.body.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === copy.confirm && el !== openBtn
    )
    expect(confirmBtn).toBeTruthy()
    await act(async () => {
      confirmBtn!.click()
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
