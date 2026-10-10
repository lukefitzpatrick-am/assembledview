/** @vitest-environment jsdom */
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { IAOCards } from "@/components/brand/IAOCards"

describe("IAOCards", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    host?.remove()
    root = null
    host = null
  })

  function render(node: ReactNode) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root?.render(node)
    })
    return host
  }

  function cards(node: HTMLElement): string[] {
    return [...node.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card") ?? "")
  }

  it("renders only the cards that have text", () => {
    const hostNode = render(
      <IAOCards
        insight={{
          body: "Meta CPM is under plan.",
          action: "   ",
          action_owner: "",
          outcome: null,
        }}
      />,
    )
    expect(cards(hostNode)).toEqual(["insight"])
    expect(hostNode.textContent).toContain("Meta CPM is under plan.")
    expect(hostNode.textContent).not.toContain("Action")
    expect(hostNode.textContent).not.toContain("Outcome")
  })

  it("renders insight, action and outcome when each field is filled", () => {
    const hostNode = render(
      <IAOCards
        insight={{
          body: "Reach is cheap.",
          action: "Move budget to Reels.",
          actionOwner: "Luke",
          outcome: "Store finder clicks are ahead.",
          outcomeKind: "achieved",
        }}
        figures={{ insight: "$5.20", action: "+$4,000", outcome: "1,940" }}
      />,
    )
    expect(cards(hostNode)).toEqual(["insight", "action", "outcome"])
    expect(hostNode.textContent).toContain("Move budget to Reels.")
    expect(hostNode.textContent).toContain("Luke")
    expect(hostNode.textContent).toContain("Achieved")
    expect(hostNode.textContent).toContain("$5.20")
  })

  it("renders nothing when every field is blank", () => {
    const hostNode = render(<IAOCards insight={{ body: " ", action: null, outcome: "" }} />)
    expect(hostNode.querySelector("[data-card]")).toBeNull()
  })
})