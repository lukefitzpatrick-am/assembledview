/**
 * B35 (MB-37): Alter Billing with `billing_ghost_row_finance_guard` on names an
 * old-id row and its current-id row with money in the same month, stops Save,
 * and "Keep the current rows" removes the old rows and moves the original total
 * down so Save works. Off: no notice, Save as before.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BillingMonth } from "@/lib/billing/types"

const switches = vi.hoisted(() => ({ on: true }))
vi.mock("@/lib/features/client", () => ({
  clientFeatureOn: (key: string) => (key === "billing_ghost_row_finance_guard" ? switches.on : false),
}))

const { AlterBillingDialog } = await import("@/components/billing/AlterBillingDialog")

const JUNE = "June 2026"
const months: BillingMonth[] = [
  {
    monthYear: JUNE,
    mediaTotal: "$74,000.00",
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: "$74,000.00",
    mediaCosts: { ooh: "$74,000.00" } as BillingMonth["mediaCosts"],
    lineItems: {
      ooh: [
        { id: "malay004ML1", header1: "Pub", header2: "Site", monthlyAmounts: { [JUNE]: 37000 }, totalAmount: 37000 },
        { id: "malay004OH1", header1: "Pub", header2: "Site", monthlyAmounts: { [JUNE]: 37000 }, totalAmount: 37000 },
      ],
    } as BillingMonth["lineItems"],
  },
]

describe("AlterBillingDialog duplicate rows (B35)", () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    switches.on = true
  })

  const saveButton = () =>
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Save Billing Changes") as HTMLButtonElement | undefined

  it("switch on: names the pair, Save is stopped, keep the current rows lets Save send one row", async () => {
    const onSave = vi.fn()
    act(() => {
      root.render(<AlterBillingDialog open onOpenChange={() => {}} initialMonths={months} mbaNumber="malay004" onSave={onSave} />)
    })
    const notice = document.querySelector('[data-billing-alias-duplicates="modal"]')
    expect(notice).not.toBeNull()
    expect(notice!.textContent).toContain("Duplicate of malay004OH1")
    expect(notice!.textContent).toContain("June 2026: $37,000.00 and $37,000.00")
    expect(notice!.textContent).toContain("moves the original total down by $37,000.00")
    expect(saveButton()?.disabled).toBe(true)

    const keep = [...document.querySelectorAll("button")].find((b) => b.textContent === "Keep the current rows")
    act(() => keep!.click())
    expect(document.querySelector('[data-billing-alias-duplicates="modal"]')).toBeNull()
    expect(document.body.textContent).toMatch(/Original total:\s*\$37,000\.00/)
    expect(saveButton()?.disabled).toBe(false)
    await act(async () => saveButton()!.click())
    expect(onSave).toHaveBeenCalledTimes(1)
    const sent = onSave.mock.calls[0]![0] as BillingMonth[]
    expect((sent[0]!.lineItems as Record<string, Array<{ id: string }>>).ooh!.map((l) => l.id)).toEqual(["malay004OH1"])
    expect(sent[0]!.totalAmount).toBe("$37,000.00")
  })

  // B35fix (H1): money moved between ML1 and OH1 before Keep is a real change.
  const keepButton = () => [...document.querySelectorAll("button")].find((b) => b.textContent === "Keep the current rows")
  function typeAmount(rowLabelIndex: number, value: string) {
    const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "ooh")
    if (trigger && trigger.getAttribute("aria-expanded") !== "true") act(() => trigger.click())
    const inputs = [...document.querySelectorAll("input")] as HTMLInputElement[]
    const input = inputs[rowLabelIndex]!
    act(() => {
      input.focus()
      input.value = value
      input.blur()
    })
  }

  it.each([
    ["OH1 down to $20,000, ML1 up to $54,000", "$20,000.00", "$54,000.00", "$20,000.00"],
    ["OH1 up to $54,000, ML1 down to $20,000", "$54,000.00", "$20,000.00", "$54,000.00"],
  ])("switch on: %s, then Keep: Save stays stopped against the total as opened", (_label, oh1, ml1, kept) => {
    const onSave = vi.fn()
    act(() => {
      root.render(<AlterBillingDialog open onOpenChange={() => {}} initialMonths={months} mbaNumber="malay004" onSave={onSave} />)
    })
    // Rows in schedule order: ML1 first, OH1 second.
    typeAmount(1, oh1)
    typeAmount(0, ml1)
    expect(document.body.textContent).toMatch(/Current total:\s*\$74,000\.00/)
    act(() => keepButton()!.click())
    expect(document.querySelector('[data-billing-alias-duplicates="modal"]')).toBeNull()
    expect(document.body.textContent).toMatch(/Original total:\s*\$37,000\.00/)
    expect(document.body.textContent).toMatch(new RegExp(`Current total:\\s*\\${kept.replace(/[.]/g, "\\.")}`))
    expect(document.querySelector("[data-alter-billing-original-rebased]")?.textContent).toContain(
      "Opened at $74,000.00, less $37,000.00 counted twice",
    )
    expect(saveButton()?.disabled).toBe(true)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("switch on: ML1 zeroed and its money put on OH1 (no pair left) is stopped too", () => {
    act(() => {
      root.render(<AlterBillingDialog open onOpenChange={() => {}} initialMonths={months} mbaNumber="malay004" onSave={vi.fn()} />)
    })
    typeAmount(0, "$0.00")
    typeAmount(1, "$74,000.00")
    expect(document.querySelector('[data-billing-alias-duplicates="modal"]')).toBeNull()
    expect(document.body.textContent).toMatch(/Original total:\s*\$37,000\.00/)
    expect(saveButton()?.disabled).toBe(true)
  })

  it("switch off: no notice and Save is not stopped by the pair", () => {
    switches.on = false
    act(() => {
      root.render(<AlterBillingDialog open onOpenChange={() => {}} initialMonths={months} mbaNumber="malay004" onSave={vi.fn()} />)
    })
    expect(document.querySelector('[data-billing-alias-duplicates="modal"]')).toBeNull()
    expect(saveButton()?.disabled).toBe(false)
  })
})
