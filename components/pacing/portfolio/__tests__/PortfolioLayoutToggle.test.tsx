/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PortfolioLayoutToggle } from "@/components/pacing/portfolio/PortfolioLayoutToggle"
import {
  PORTFOLIO_LAYOUT_STORAGE_KEY,
  resetPortfolioLayoutCacheForTests,
  writePortfolioLayout,
} from "@/lib/pacing/portfolio/portfolioLayout"

describe("PortfolioLayoutToggle", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetPortfolioLayoutCacheForTests()
    writePortfolioLayout("cards")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    window.localStorage.clear()
    resetPortfolioLayoutCacheForTests()
  })

  it("persists Cards / Table across remount", () => {
    act(() => {
      root.render(<PortfolioLayoutToggle />)
    })
    const tableBtn = [...container.querySelectorAll("button")].find(
      (el) => el.textContent === "Table",
    )
    expect(tableBtn).toBeTruthy()
    expect(tableBtn!.getAttribute("data-state")).toBe("off")

    act(() => {
      tableBtn!.click()
    })
    expect(tableBtn!.getAttribute("data-state")).toBe("on")
    expect(window.localStorage.getItem(PORTFOLIO_LAYOUT_STORAGE_KEY)).toBe("table")

    act(() => {
      root.unmount()
    })
    resetPortfolioLayoutCacheForTests()
    root = createRoot(container)
    act(() => {
      root.render(<PortfolioLayoutToggle />)
    })

    const remounted = [...container.querySelectorAll("button")].find(
      (el) => el.textContent === "Table",
    )
    expect(remounted?.getAttribute("data-state")).toBe("on")
    expect(window.localStorage.getItem(PORTFOLIO_LAYOUT_STORAGE_KEY)).toBe("table")
  })
})
