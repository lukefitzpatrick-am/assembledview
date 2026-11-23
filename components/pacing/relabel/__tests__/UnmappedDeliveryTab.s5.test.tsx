/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setClientFeatureSnapshot } from "@/lib/features/client"
import { UnmappedDeliveryTab } from "../UnmappedDeliveryTab"

function row(over: Record<string, unknown>) {
  return {
    channel: "Social - Meta",
    platformEntityId: "1",
    name: "Old ad set",
    campaignName: "PGA Tour",
    account: null,
    firstDate: "2026-11-10",
    lastDate: "2026-11-22",
    spend: 100,
    impressions: 1000,
    currentLineItemId: null,
    suggestion: { kind: "add_line", mba: "pgaaus015", lineItemId: null, action: "Add the line id." },
    ...over,
  }
}

const DELIVERY = {
  windowDays: 30,
  rows: [
    row({}),
    row({ platformEntityId: "2", name: "New ad set", firstDate: "2026-11-21" }),
  ],
}

describe("UnmappedDeliveryTab (S5)", () => {
  let container: HTMLDivElement
  let root: Root
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-23T01:00:00Z")) // 23 Nov, Melbourne
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => DELIVERY })),
    )
    writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    setClientFeatureSnapshot(null)
  })

  async function settle() {
    await act(async () => {
      for (let i = 0; i < 4; i++) await Promise.resolve()
    })
  }

  const buttons = () => [...container.querySelectorAll("button")]

  it("switch on: days unmatched per row, and a supplier note only from 3 days", async () => {
    setClientFeatureSnapshot({ unmapped_delivery: true, unmatched_delivery_queue: true })
    act(() => {
      root.render(<UnmappedDeliveryTab mbaFilter="" onRelabel={() => {}} />)
    })
    await settle()
    expect([...container.querySelectorAll("th")].map((th) => th.textContent)).toContain("Days unmatched")
    const cells = [...container.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent))
    expect(cells[0]).toContain("13")
    expect(cells[1]).toContain("2")
    const copy = buttons().filter((b) => b.textContent === "Copy supplier note")
    expect(copy).toHaveLength(1)
    expect(copy[0]!.getAttribute("aria-label")).toBe("Copy supplier note for Old ad set")

    await act(async () => {
      copy[0]!.click()
    })
    await settle()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(String(writeText.mock.calls[0]![0])).toContain("for at least 13 days")
    expect(String(writeText.mock.calls[0]![0])).toContain("(it starts PGAAUS015)")
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Supplier note for Old ad set copied.")
  })

  // The browser snapshot arrives with `requires` already resolved (requires.b48.test.ts).
  it("switch off: no age column, no note", async () => {
    setClientFeatureSnapshot({ unmapped_delivery: true, unmatched_delivery_queue: false })
    act(() => {
      root.render(<UnmappedDeliveryTab mbaFilter="" onRelabel={() => {}} />)
    })
    await settle()
    expect(container.textContent).toContain("Old ad set")
    expect(container.textContent).not.toContain("Days unmatched")
    expect(buttons().some((b) => b.textContent === "Copy supplier note")).toBe(false)
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it("S5fix (H1): a match row links to Match for its MBA and has no Relabel button to pre-fill", async () => {
    setClientFeatureSnapshot({ unmapped_delivery: true, unmatched_delivery_queue: false })
    const onRelabel = vi.fn()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          windowDays: 30,
          rows: [row({ currentLineItemId: "hartm0011", suggestion: { kind: "match", mba: "hartm001", lineItemId: "hartm0011", action: "Check it on Match." } })],
        }),
      })),
    )
    act(() => {
      root.render(<UnmappedDeliveryTab mbaFilter="" onRelabel={onRelabel} />)
    })
    await settle()
    const link = container.querySelector("tbody a") as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("/pacing/admin/relabels?mba=hartm001")
    expect(link.getAttribute("aria-label")).toBe("Open Match for hartm001")
    expect(container.textContent).toContain("Check on Match")
    expect(container.textContent).not.toContain("Not on plan")
    expect(buttons().some((b) => b.textContent === "Relabel")).toBe(false)
    expect(onRelabel).not.toHaveBeenCalled()
  })

  it("S5fix (L1): switch off, the action cell is the bare Relabel button, as before", async () => {
    setClientFeatureSnapshot({ unmapped_delivery: true, unmatched_delivery_queue: false })
    act(() => {
      root.render(<UnmappedDeliveryTab mbaFilter="" onRelabel={() => {}} />)
    })
    await settle()
    for (const tr of container.querySelectorAll("tbody tr")) {
      const cell = tr.lastElementChild!
      expect(cell.children).toHaveLength(1)
      expect(cell.firstElementChild!.tagName).toBe("BUTTON")
    }
  })

  it("S5fix (L6): a refused copy shows the note to select; a repeat copy is announced again", async () => {
    setClientFeatureSnapshot({ unmapped_delivery: true, unmatched_delivery_queue: true })
    let release: () => void = () => {}
    writeText.mockImplementation(() => new Promise<void>((r) => (release = r)))
    act(() => {
      root.render(<UnmappedDeliveryTab mbaFilter="" onRelabel={() => {}} />)
    })
    await settle()
    const copy = () => buttons().find((b) => b.textContent === "Copy supplier note")!
    const status = () => container.querySelector('[role="status"]')!.textContent
    for (let i = 0; i < 2; i++) {
      act(() => {
        copy().click()
      })
      expect(status()).toBe("")
      await act(async () => {
        release()
      })
      await settle()
      expect(status()).toBe("Supplier note for Old ad set copied.")
    }

    writeText.mockImplementation(async () => {
      throw new Error("denied")
    })
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true })
    await act(async () => {
      copy().click()
    })
    await settle()
    expect(status()).toBe("Could not copy. The note for Old ad set is below the table; select it and copy.")
    const box = container.querySelector("textarea") as HTMLTextAreaElement
    expect(box.readOnly).toBe(true)
    expect(box.value).toContain("Old ad set")
    expect(box.closest("label")!.textContent).toContain("Supplier note for Old ad set")
  })
})
