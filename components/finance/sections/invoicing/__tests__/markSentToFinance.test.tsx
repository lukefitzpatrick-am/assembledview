/**
 * Mark as sent to finance — AlertDialog confirm, never window.confirm.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  MARK_SENT_TO_FINANCE_CONFIRM,
  MARK_SENT_TO_FINANCE_COPY,
  MARK_SENT_TO_FINANCE_TITLE,
} from "@/lib/finance/markSentToFinanceCopy"
import { MarkSentToFinanceButton } from "../MarkSentToFinanceButton"

describe("MarkSentToFinanceButton", () => {
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

  it("opens an AlertDialog with the mark-sent copy and never calls window.confirm", async () => {
    act(() => {
      root.render(<MarkSentToFinanceButton onConfirm={onConfirm} />)
    })
    const openBtn = [...container.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === MARK_SENT_TO_FINANCE_CONFIRM
    )
    expect(openBtn).toBeTruthy()
    await act(async () => {
      openBtn!.click()
    })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(MARK_SENT_TO_FINANCE_TITLE)
    expect(document.body.textContent).toContain(MARK_SENT_TO_FINANCE_COPY)
    const nested = [...document.body.querySelectorAll("[class*='z-nested']")]
    expect(nested.length).toBeGreaterThan(0)
    expect(onConfirm).not.toHaveBeenCalled()
    const confirmBtn = [...document.body.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === MARK_SENT_TO_FINANCE_CONFIRM && el !== openBtn
    )
    expect(confirmBtn).toBeTruthy()
    await act(async () => {
      confirmBtn!.click()
    })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
