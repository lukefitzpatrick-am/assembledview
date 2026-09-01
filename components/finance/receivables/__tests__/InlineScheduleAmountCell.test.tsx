/**
 * Inline schedule amount cell — type/blur/Enter commit, Escape revert, billed warn.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BillingLineItem } from "@/lib/types/financeBilling"

const commitMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/finance/commitInlineScheduleAmountEdit", () => ({
  commitInlineScheduleAmountEdit: commitMock,
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

import { InlineScheduleAmountCell } from "../InlineScheduleAmountCell"

const LINE: BillingLineItem = {
  id: 1,
  finance_billing_records_id: 9,
  item_code: "TV",
  line_type: "media",
  media_type: "TV",
  description: "Spot",
  publisher_name: "Nine",
  amount: 1000,
  client_pays_media: false,
  sort_order: 0,
  schedule_line_item_id: "billing-tv::MBA001TV1",
  billing_mode: "auto",
}

const CTX = {
  versionId: 42,
  versionNumber: 3,
  mbaNumber: "MBA001",
  billingMonthIso: "2026-07",
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("InlineScheduleAmountCell", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    commitMock.mockReset()
    toastMock.mockReset()
    commitMock.mockResolvedValue({
      amount: 4321.5,
      stampedManual: true,
      showedDivergenceToast: false,
    })
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

  function renderCell(invoiceBilled?: boolean) {
    act(() => {
      root.render(
        <InlineScheduleAmountCell
          line={LINE}
          ctx={CTX}
          {...(invoiceBilled != null ? { invoiceBilled } : {})}
        />
      )
    })
  }

  function openEditor(): HTMLInputElement {
    const btn = container.querySelector("button")
    expect(btn).toBeTruthy()
    act(() => {
      btn!.click()
    })
    const input = container.querySelector("input")
    expect(input).toBeTruthy()
    return input as HTMLInputElement
  }

  async function typeAmount(input: HTMLInputElement, value: string) {
    await act(async () => {
      input.focus()
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })
    act(() => {
      setNativeValue(input, value)
    })
  }

  function confirmDialogButton(label: string): HTMLButtonElement {
    const btn = [...document.body.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === label
    )
    expect(btn).toBeTruthy()
    return btn as HTMLButtonElement
  }

  async function flushMicrotasks() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it("commits the typed amount on blur", async () => {
    renderCell()
    const input = openEditor()
    await typeAmount(input, "4321.50")
    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
    })
    await flushMicrotasks()
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(commitMock.mock.calls[0][0].amount).toBe(4321.5)
  })

  it("commits the typed amount on Enter", async () => {
    renderCell()
    const input = openEditor()
    await typeAmount(input, "4321.50")
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    await flushMicrotasks()
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(commitMock.mock.calls[0][0].amount).toBe(4321.5)
  })

  it("reverts on Escape and does not fire a request", async () => {
    renderCell()
    const input = openEditor()
    await typeAmount(input, "4321.50")
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    await flushMicrotasks()
    expect(commitMock).not.toHaveBeenCalled()
    expect(container.querySelector("button")?.textContent).toContain("1,000.00")
  })

  it("does not fire a request on a no-change blur", async () => {
    renderCell()
    const input = openEditor()
    await act(async () => {
      input.focus()
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
      input.blur()
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
    })
    await flushMicrotasks()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it("reverts and toasts when commit fails", async () => {
    commitMock.mockRejectedValueOnce(new Error("Save failed (409)"))
    renderCell()
    const input = openEditor()
    await typeAmount(input, "4321.50")
    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
    })
    await flushMicrotasks()
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Could not save amount",
        description: "Save failed (409)",
      })
    )
    expect(container.querySelector("button")?.textContent).toContain("1,000.00")
  })

  it("marks billed invoices and confirms before committing", async () => {
    renderCell(true)
    expect(container.textContent).toMatch(/Already billed/)
    const input = openEditor()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Already billed",
      })
    )
    await typeAmount(input, "4321.50")
    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
    })
    await flushMicrotasks()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
    await act(async () => {
      confirmDialogButton("Continue").click()
    })
    await flushMicrotasks()
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(commitMock.mock.calls[0][0].amount).toBe(4321.5)
  })

  it("does not commit a billed edit when confirm is declined", async () => {
    renderCell(true)
    const input = openEditor()
    await typeAmount(input, "4321.50")
    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
    })
    await flushMicrotasks()
    expect(window.confirm).not.toHaveBeenCalled()
    await act(async () => {
      confirmDialogButton("Cancel").click()
    })
    await flushMicrotasks()
    expect(commitMock).not.toHaveBeenCalled()
    expect(container.querySelector("button")?.textContent).toContain("1,000.00")
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Amount not saved",
      })
    )
  })
})
