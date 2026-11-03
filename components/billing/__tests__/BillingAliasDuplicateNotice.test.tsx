/**
 * B20 ghost-row guard notice: names each line, chips "Duplicate of …", both
 * amounts in the MBA billing window, and the keep-current action.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BillingAliasDuplicateNotice } from "@/components/billing/BillingAliasDuplicateNotice"
import type { BillingAliasGhostLine } from "@/lib/billing/billingAliasGhostPairs"

const lines: BillingAliasGhostLine[] = [
  {
    mediaKey: "digiDisplay",
    oldId: "hema001ML4",
    currentId: "hema001DD4",
    months: [
      { monthYear: "May 2026", oldAmount: 3, currentAmount: 3 },
      { monthYear: "June 2026", oldAmount: 3, currentAmount: 3 },
    ],
    oldTotal: 6,
  },
  {
    mediaKey: "digiDisplay",
    oldId: "hema001ML6",
    currentId: "hema001DD6",
    months: [{ monthYear: "June 2026", oldAmount: 34, currentAmount: 34 }],
    oldTotal: 34,
  },
]

describe("BillingAliasDuplicateNotice", () => {
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
  })

  it("renders nothing without lines", () => {
    expect(renderToStaticMarkup(<BillingAliasDuplicateNotice lines={[]} total={0} />)).toBe("")
  })

  it("rail: names each line with a chip and the doubled total", () => {
    const html = renderToStaticMarkup(<BillingAliasDuplicateNotice lines={lines} total={40} />)
    expect(html).toContain("Duplicate billing rows")
    expect(html).toContain("$40.00 is counted twice")
    expect(html).toContain("hema001ML4")
    expect(html).toContain("Duplicate of hema001DD4")
    expect(html).toContain("Duplicate of hema001DD6")
    expect(html).toContain("$6.00 over 2 months")
    expect(html).not.toContain("Keep the current rows")
  })

  it("modal: both amounts per month, and the keep-current action calls back", () => {
    const onKeep = vi.fn()
    act(() => {
      root.render(<BillingAliasDuplicateNotice lines={lines} total={40} variant="modal" onKeepCurrentRows={onKeep} />)
    })
    expect(host.textContent).toContain("May 2026: $3.00 and $3.00 · June 2026: $3.00 and $3.00")
    expect(host.textContent).toContain("June 2026: $34.00 and $34.00")
    expect(host.querySelector('[data-billing-alias-duplicates="modal"]')).not.toBeNull()
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Keep the current rows")
    expect(button).toBeTruthy()
    act(() => button!.click())
    expect(onKeep).toHaveBeenCalledTimes(1)
  })
})
