/**
 * S2 A (B56): the billed months question on the plan pages. It lists each
 * changed invoiced month, keep is selected, credit is shown disabled with the
 * reason, and the answer goes back to the save.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BilledMonthsChoiceHost } from "@/components/mediaplans/BilledMonthsChoiceDialog"
import { CREDIT_UNAVAILABLE_REASON, type BilledMonth } from "@/lib/finance/billedMonths/choice"
import { chooseBilledMonths } from "@/lib/mediaplan/billedMonthsChoicePrompt"

const months: BilledMonth[] = [
  { month: "2026-09", reasons: ["xero_matched"], baseCents: 100000, candidateCents: 80000, deltaCents: -20000, changed: true, lines: [] },
  { month: "2026-10", reasons: ["xero_outside_av"], baseCents: 50000, candidateCents: 50000, deltaCents: 0, changed: true, lines: [] },
]

describe("BilledMonthsChoiceHost", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<BilledMonthsChoiceHost />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  /** Opens the question; the answer is wrapped so awaiting the open does not wait for it. */
  async function ask(): Promise<{ answer: Promise<unknown> }> {
    let answer: Promise<unknown> = Promise.resolve()
    await act(async () => {
      answer = chooseBilledMonths(months)
    })
    return { answer }
  }

  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement

  it("lists each month and its change, with keep selected and credit disabled with the reason", async () => {
    await ask()
    const dialog = document.querySelector('[role="alertdialog"]')!
    const text = dialog.textContent ?? ""
    expect(text).toContain("This version changes invoiced months")
    const rows = [...dialog.querySelectorAll("tbody tr")].map((r) => [...r.children].map((c) => c.textContent))
    expect(rows).toEqual([
      ["Sep 2026", "$1,000.00", "$800.00", "-$200.00"],
      ["Oct 2026", "$500.00", "$500.00", "Same total, lines differ"],
    ])
    const keep = dialog.querySelector('input[value="keep"]') as HTMLInputElement
    const credit = dialog.querySelector('input[value="credit"]') as HTMLInputElement
    expect(keep.checked).toBe(true)
    expect(credit.checked).toBe(false)
    expect(credit.disabled).toBe(true)
    expect(document.getElementById(credit.getAttribute("aria-describedby")!)?.textContent).toBe(CREDIT_UNAVAILABLE_REASON)
    expect(dialog.querySelector("legend")?.textContent).toBe("What happens to these months")
  })

  it("publish answers keep; cancel answers nothing", async () => {
    let { answer } = await ask()
    await act(async () => button("Publish, keeping billed rows").click())
    await expect(answer).resolves.toBe("keep")
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()

    ;({ answer } = await ask())
    await act(async () => button("Cancel").click())
    await expect(answer).resolves.toBeNull()
  })
})
