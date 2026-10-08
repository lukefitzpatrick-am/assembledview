/**
 * Card Media and Fee cells from lineTotals.
 *
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  CanonicalBurstMoney,
  NET_FEE_WARNING,
} from "@/components/media-containers/CanonicalBurstMoney"
import { formatCardTitleFromLine } from "@/lib/mediaplan/cardTitleFromLine"

function money(host: HTMLElement, label: "Media" | "Fee"): string {
  const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)
  return input?.value ?? ""
}

describe("CanonicalBurstMoney", () => {
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

  function render(node: ReactNode) {
    act(() => {
      root.render(node)
    })
  }

  it("shows 850 and 150 for a gross-in line of 1,000 at 15%", () => {
    render(
      <>
        <CanonicalBurstMoney
          budget={1000}
          buyType="cpm"
          budgetIncludesFees
          feePct={15}
        />
        <span data-testid="title">
          {formatCardTitleFromLine(
            {
              buyType: "cpm",
              budgetIncludesFees: true,
              bursts: [{ budget: 1000 }],
            },
            15,
          )}
        </span>
      </>,
    )
    expect(money(host, "Media")).toBe("$850.00")
    expect(money(host, "Fee")).toBe("$150.00")
    expect(host.querySelector("[data-testid='title']")?.textContent).toBe("$1,000.00")
    expect(host.textContent).not.toContain("Client paid")
    expect(host.querySelector(`[aria-label="${NET_FEE_WARNING}"]`)).toBeNull()
  })

  it("shows $0 media and fee for a bonus line that still has a budget", () => {
    render(<CanonicalBurstMoney budget={1000} buyType="bonus" feePct={15} />)
    expect(money(host, "Media")).toBe("$0.00")
    expect(money(host, "Fee")).toBe("$0.00")
    expect(host.textContent).not.toContain("Client paid")
  })

  it("shows planned media plus fee, marked client paid", () => {
    render(
      <CanonicalBurstMoney
        budget={1000}
        buyType="cpm"
        clientPaysForMedia
        feePct={15}
      />,
    )
    expect(money(host, "Media")).toBe("$1,000.00")
    expect(money(host, "Fee")).toBe("$176.47")
    expect(host.textContent).toContain("Client paid")
  })

  it("shows fee $0 and a warning for a 100% fee on a net budget", () => {
    render(<CanonicalBurstMoney budget={1000} buyType="cpm" feePct={100} />)
    expect(money(host, "Media")).toBe("$1,000.00")
    expect(money(host, "Fee")).toBe("$0.00")
    expect(host.querySelector(`[aria-label="${NET_FEE_WARNING}"]`)).not.toBeNull()
  })
})
