/**
 * Plan C S2b — LineTimingInlineEditor flag-off vs flag-on behaviour.
 * Snapshots use stable text excerpts (not full class soup) so DOM serialisation
 * differences (inputMode casing, self-closing) do not flake.
 */
/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { act, createElement, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { LineTimingInlineEditor } from "@/components/billing/LineTimingInlineEditor"
import { DateBasisKeepResetDialog } from "@/components/billing/DateBasisKeepResetDialog"

const formatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
})

function mount(node: ReactNode): { text: string; html: string; root: Root; el: HTMLDivElement } {
  const el = document.createElement("div")
  document.body.appendChild(el)
  const root = createRoot(el)
  act(() => {
    root.render(node)
  })
  return {
    text: document.body.textContent ?? "",
    html: el.innerHTML,
    root,
    el,
  }
}

function unmount(root: Root, el: HTMLDivElement) {
  act(() => {
    root.unmount()
  })
  el.remove()
}

function renderTiming(balancerEnabled: boolean) {
  return mount(
    createElement(LineTimingInlineEditor, {
      mediaKey: "search",
      lineItemId: "li-1",
      expectedMediaTotal: 1000,
      monthYears: ["May 2026", "June 2026", "July 2026"],
      getAmount: (_m, _id, monthYear) =>
        monthYear === "May 2026" ? 400 : monthYear === "June 2026" ? 300 : 300,
      getAutoAmount: (_m, _id, monthYear) =>
        monthYear === "May 2026" ? 400 : monthYear === "June 2026" ? 300 : 300,
      onCommit: () => {},
      onResetToAuto: () => {},
      onPrebill: () => {},
      formatter,
      balancerEnabled,
    })
  )
}

describe("LineTimingInlineEditor Plan C balancer flag", () => {
  it("flag off — no balancer glyph, no distribute evenly, editable months (today)", () => {
    const { text, html, root, el } = renderTiming(false)
    expect(html).not.toContain("⚖")
    expect(text).not.toContain("Distribute evenly")
    expect(text).not.toContain("Move balancer")
    expect(text).not.toContain("Negative month")
    expect(text).toContain("Months")
    expect(text).toContain("Reset to auto")
    expect(text).toMatchSnapshot("flag-off-text")
    unmount(root, el)
  })

  it("flag on — balancer month read-only with ⚖ and distribute evenly", () => {
    const { text, html, root, el } = renderTiming(true)
    expect(html).toContain("⚖")
    expect(text).toContain("Distribute evenly")
    expect(text).toContain("Move balancer")
    expect(html).toContain("✓")
    expect(text).toMatchSnapshot("flag-on-text")
    unmount(root, el)
  })

  it("flag on — negative balancer shows warning copy", () => {
    const { text, root, el } = mount(
      createElement(LineTimingInlineEditor, {
        mediaKey: "search",
        lineItemId: "li-1",
        expectedMediaTotal: 100,
        monthYears: ["May 2026", "June 2026"],
        getAmount: (_m, _id, monthYear) => (monthYear === "May 2026" ? 250 : 0),
        getAutoAmount: (_m, _id, monthYear) => (monthYear === "May 2026" ? 50 : 50),
        onCommit: () => {},
        onResetToAuto: () => {},
        onPrebill: () => {},
        formatter,
        balancerEnabled: true,
      })
    )
    expect(text).toContain("Negative month — usually wrong")
    unmount(root, el)
  })
})

describe("DateBasisKeepResetDialog keep-shape+delta option", () => {
  it("flag off — only keep + reset (no third option)", () => {
    const { text, root, el } = mount(
      createElement(DateBasisKeepResetDialog, {
        open: true,
        stale: [
          {
            lineItemId: "li-1",
            component: "media",
            storedDateBasis: "a",
            currentDateBasis: "b",
            label: "Line A",
          },
        ],
        onKeep: () => {},
        onReset: () => {},
        onCancel: () => {},
        balancerEnabled: false,
        onKeepShapePlusDelta: () => {},
        keepShapePlusDeltaPreview: [{ month: "2026-07", amount: 10 }],
      })
    )
    expect(text).toContain("Keep the prepayment as set")
    expect(text).toContain("Reset to the new schedule")
    expect(text).not.toContain("Keep shape + delta")
    expect(text).toMatchSnapshot("date-basis-flag-off-text")
    unmount(root, el)
  })

  it("flag on — third option + preview", () => {
    const { text, root, el } = mount(
      createElement(DateBasisKeepResetDialog, {
        open: true,
        stale: [
          {
            lineItemId: "li-1",
            component: "media",
            storedDateBasis: "a",
            currentDateBasis: "b",
            label: "Line A",
          },
        ],
        onKeep: () => {},
        onReset: () => {},
        onCancel: () => {},
        balancerEnabled: true,
        onKeepShapePlusDelta: () => {},
        keepShapePlusDeltaPreview: [{ month: "2026-07", amount: 40 }],
      })
    )
    expect(text).toContain("Keep shape + delta")
    expect(text).toContain("Keep shape + delta preview")
    expect(text).toMatchSnapshot("date-basis-flag-on-text")
    unmount(root, el)
  })
})
