/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ChannelLayoutToggle } from "@/components/pacing/channel/ChannelLayoutToggle"
import {
  channelLayoutStorageKey,
  resetChannelLayoutCacheForTests,
  writeChannelLayout,
} from "@/lib/pacing/channel/channelLayout"

describe("ChannelLayoutToggle", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    resetChannelLayoutCacheForTests()
    writeChannelLayout("search", "cards")
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
    resetChannelLayoutCacheForTests()
  })

  it("persists Cards / Table under pacing.searchLayout", () => {
    act(() => {
      root.render(<ChannelLayoutToggle channel="search" />)
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
    expect(window.localStorage.getItem(channelLayoutStorageKey("search"))).toBe("table")

    act(() => {
      root.unmount()
    })
    resetChannelLayoutCacheForTests()
    root = createRoot(container)
    act(() => {
      root.render(<ChannelLayoutToggle channel="search" />)
    })

    const remounted = [...container.querySelectorAll("button")].find(
      (el) => el.textContent === "Table",
    )
    expect(remounted?.getAttribute("data-state")).toBe("on")
  })
})
