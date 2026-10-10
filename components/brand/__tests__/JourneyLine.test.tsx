/** @vitest-environment jsdom */
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { JourneyLine } from "@/components/brand/JourneyLine"
import { journeyModel, type JourneyStatus } from "@/components/brand/journeySteps"

const STATUSES: JourneyStatus[] = ["planned", "approved", "booked", "live", "completed", "cancelled"]

describe("JourneyLine step states", () => {
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

  it("marks done, current and future steps for each status", () => {
    expect(journeyModel("planned").kind).toBe("line")
    expect(states("planned")).toEqual(["current", "future", "future", "future", "future"])
    expect(states("approved")).toEqual(["done-first", "current", "future", "future", "future"])
    expect(states("booked")).toEqual(["done-first", "done", "current", "future", "future"])
    expect(states("live")).toEqual(["done-first", "done", "done", "current", "future"])
    expect(states("completed")).toEqual(["done-first", "done", "done", "done", "current"])
    expect(journeyModel("cancelled")).toEqual({ kind: "cancelled", label: "Cancelled" })
    expect(STATUSES).toHaveLength(6)
  })

  it("renders the line for live and a single pill for cancelled", () => {
    const live = render(<JourneyLine status="live" />)
    expect(live.querySelector("[data-step='planned']")?.getAttribute("data-state")).toBe("done-first")
    expect(live.querySelector("[data-step='live']")?.getAttribute("data-state")).toBe("current")
    expect(live.querySelector("[data-step='completed']")?.getAttribute("data-state")).toBe("future")
    expect(live.querySelector("[data-step='booked'] [data-line]")?.getAttribute("data-line")).toBe("done")
    expect(live.querySelector("[data-step='live'] [data-line]")?.getAttribute("data-line")).toBe("future")
    expect(live.textContent).toContain("Planned")
    expect(live.textContent).not.toContain("Cancelled")

    act(() => {
      root?.render(<JourneyLine status="cancelled" />)
    })
    expect(host?.textContent).toContain("Cancelled")
    expect(host?.querySelector("[data-step]")).toBeNull()
    expect(host?.textContent).not.toContain("Planned")
  })
})

function states(status: JourneyStatus): string[] {
  const model = journeyModel(status)
  if (model.kind !== "line") return []
  return model.steps.map((step) => step.state)
}
