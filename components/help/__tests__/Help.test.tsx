/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/mediaplans/create" }))

import { HelpPanel, HelpTip } from "@/components/help/Help"
import { setClientFeatureSnapshot } from "@/lib/features/client"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("in-app help", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    setClientFeatureSnapshot(null)
  })

  function render(node: React.ReactNode) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(node))
  }

  it("off: no Help button and no tips", () => {
    setClientFeatureSnapshot({ in_app_help: false })
    render(
      <>
        <HelpPanel />
        <HelpTip id="planUnallocated" label="Unallocated" />
      </>,
    )
    expect(host!.querySelector("button")).toBeNull()
  })

  it("on: Help opens the page's walkthrough, and a tip has a name", () => {
    setClientFeatureSnapshot({ in_app_help: true })
    render(
      <>
        <HelpPanel />
        <HelpTip id="planUnallocated" label="Unallocated" />
      </>,
    )
    expect(host!.querySelector('[aria-label="Help: Unallocated"]')).not.toBeNull()
    const help = [...host!.querySelectorAll("button")].find((b) => b.textContent === "Help")!
    act(() => help.click())
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain("Create a campaign")
    expect(dialog.querySelectorAll("ol li")).toHaveLength(4)
    expect([...dialog.querySelectorAll("button")].filter((b) => b.textContent === "Show me")).toHaveLength(4)
  })
})
