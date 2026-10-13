/** @vitest-environment jsdom */
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import MediaGanttChart from "@/app/dashboard/[slug]/[mba_number]/components/MediaGanttChart"
import { prepareMediaPlanExportClone } from "@/components/dashboard/campaign/MediaPlanVizSection"
import MediaContainerTimelineCollapsible from "@/components/media-containers/MediaContainerTimelineCollapsible"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

function render(node: ReactElement) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(node)
  })
  mounted.push({ host, root })
  return host
}

afterEach(() => {
  for (const entry of mounted) {
    act(() => entry.root.unmount())
    entry.host.remove()
  }
  mounted.length = 0
})

function line(
  id: string,
  publisher: string,
  startDate = "2026-01-05",
  endDate = "2026-02-20",
): NormalisedLineItem {
  return {
    lineItemId: id,
    publisher,
    platform: publisher,
    network: publisher,
    bursts: [
      {
        startDate,
        endDate,
        deliverables: 1000,
        deliverablesAmount: 1000,
        budget: 100,
      },
    ],
  } as NormalisedLineItem
}

function flightingLines() {
  return {
    search: Array.from({ length: 8 }, (_, index) => line(`s${index}`, `Search line ${index}`)),
    television: Array.from({ length: 8 }, (_, index) => line(`t${index}`, `Television line ${index}`)),
    bvod: Array.from({ length: 6 }, (_, index) => line(`b${index}`, `Bvod line ${index}`)),
  }
}

function channelButton(host: HTMLElement, name: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button[aria-expanded]")].find((button) =>
    (button.getAttribute("aria-label") ?? button.textContent ?? "").includes(name),
  )
  if (!(match instanceof HTMLButtonElement)) throw new Error(`missing channel button ${name}`)
  return match
}

function namedButton(host: HTMLElement, name: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === name)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`missing button ${name}`)
  return match
}

function press(button: HTMLElement, key: string) {
  act(() => {
    button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

function manyLines(count: number) {
  const channels = ["search", "television", "bvod"] as const
  const buckets: Record<string, NormalisedLineItem[]> = { search: [], television: [], bvod: [] }
  for (let index = 0; index < count; index++) {
    const channel = channels[index % channels.length]!
    buckets[channel]!.push(line(`${channel}-${index}`, `${channel} line ${index}`))
  }
  return buckets
}

function bodyLabelText(host: HTMLElement): string {
  return [...host.querySelectorAll("svg text")]
    .filter((node) => !node.closest("[data-gantt-axis]"))
    .map((node) => node.textContent ?? "")
    .join("\n")
}

describe("client flighting groups by channel", () => {
  it("expands one channel and Collapse all hides its lines", () => {
    const host = render(
      <MediaGanttChart
        lineItems={flightingLines()}
        startDate="2026-01-01"
        endDate="2026-03-31"
        deliveredByLineId={new Map([["s0", 400]])}
        flighting
        grouped
      />,
    )

    expect(host.textContent).not.toContain("Search line 0")
    expect(host.textContent).not.toContain("400 of 1K")
    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("false")
    expect(channelButton(host, "Search").getAttribute("aria-label")).toContain("8 lines")

    act(() => {
      channelButton(host, "Search").click()
    })

    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("true")
    expect(host.textContent).toContain("Search line 0")
    expect(host.textContent).toContain("400 of 1K")
    expect(host.textContent).not.toContain("Television line 0")

    act(() => {
      namedButton(host, "Collapse all").click()
    })

    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("false")
    expect(host.textContent).not.toContain("Search line 0")
    expect(host.textContent).not.toContain("400 of 1K")
  })

  it("leaves the plan editor timeline one row per line", () => {
    const ungrouped = render(
      <MediaGanttChart
        lineItems={flightingLines()}
        startDate="2026-01-01"
        endDate="2026-03-31"
      />,
    )
    expect(ungrouped.textContent).not.toContain("Expand all")
    expect(ungrouped.querySelector("button[aria-expanded]")).toBeNull()
    expect(ungrouped.textContent).toContain("Search line 0")
    expect(ungrouped.textContent).toContain("Television line 0")
    expect(ungrouped.textContent).toContain("Bvod line 0")

    const editor = render(
      <MediaContainerTimelineCollapsible
        mediaTypeKey="search"
        lineItems={[
          {
            lineItemId: "e1",
            publisher: "Editor line",
            platform: "Editor line",
            network: "Editor line",
            bursts: [
              { startDate: "2026-02-02", endDate: "2026-02-16", deliverables: 5, budget: 50 },
            ],
          },
          {
            lineItemId: "e2",
            publisher: "Editor other",
            platform: "Editor other",
            network: "Editor other",
            bursts: [
              { startDate: "2026-02-02", endDate: "2026-02-16", deliverables: 5, budget: 50 },
            ],
          },
        ]}
        campaignStartDate={new Date(2026, 1, 1)}
        campaignEndDate={new Date(2026, 2, 31)}
      />,
    )

    expect(editor.textContent).not.toContain("Expand all")
    act(() => {
      namedButton(editor, "Schedule preview").click()
    })
    expect(editor.textContent).toContain("Editor line")
    expect(editor.textContent).toContain("Editor other")
    expect(editor.textContent).not.toContain("Expand all")
    expect(editor.textContent).not.toContain("Collapse all")
  })

  it("renders one axis for a 150-line plan, including when every channel is open", () => {
    const host = render(
      <MediaGanttChart
        lineItems={manyLines(150)}
        startDate="2026-01-01"
        endDate="2026-03-31"
        flighting
        grouped
      />,
    )

    expect(host.querySelectorAll("[data-gantt-axis]")).toHaveLength(1)
    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("false")

    act(() => {
      namedButton(host, "Expand all").click()
    })

    expect(host.querySelectorAll("[data-gantt-axis]")).toHaveLength(1)
    expect(host.textContent).toContain("search line 0")
    expect(host.textContent).toContain("television line 1")
  })

  it("toggles one channel from the summary row with click, Enter, and Space", () => {
    const host = render(
      <MediaGanttChart
        lineItems={flightingLines()}
        startDate="2026-01-01"
        endDate="2026-03-31"
        flighting
        grouped
      />,
    )
    const search = channelButton(host, "Search")
    expect(search.getAttribute("aria-expanded")).toBe("false")
    expect(search.getAttribute("aria-label")).toContain("8 lines")
    expect(search.querySelector("svg")).not.toBeNull()

    act(() => {
      search.click()
    })
    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("true")
    expect(channelButton(host, "Search").querySelector("svg")?.getAttribute("class")).toContain("rotate-90")
    expect(host.textContent).toContain("Search line 0")
    expect(host.textContent).not.toContain("Television line 0")

    press(channelButton(host, "Search"), "Enter")
    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("false")
    expect(host.textContent).not.toContain("Search line 0")

    press(channelButton(host, "Search"), " ")
    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("true")
    expect(host.textContent).toContain("Search line 0")
    expect(channelButton(host, "Television").getAttribute("aria-expanded")).toBe("false")
  })

  it("lists expanded lines in plan position order", () => {
    const host = render(
      <MediaGanttChart
        lineItems={{
          television: [
            line("z", "Order Zebra"),
            line("a", "Order Alpha"),
            line("m", "Order Middle"),
          ],
        }}
        startDate="2026-01-01"
        endDate="2026-03-31"
        flighting
        grouped
      />,
    )
    expect(channelButton(host, "Television").getAttribute("aria-expanded")).toBe("true")
    const text = bodyLabelText(host)
    const zebra = text.indexOf("Order Zebra")
    const alpha = text.indexOf("Order Alpha")
    const middle = text.indexOf("Order Middle")
    expect(zebra).toBeGreaterThanOrEqual(0)
    expect(zebra).toBeLessThan(alpha)
    expect(alpha).toBeLessThan(middle)
  })

  it("starts a 12-line plan expanded", () => {
    const host = render(
      <MediaGanttChart
        lineItems={manyLines(12)}
        startDate="2026-01-01"
        endDate="2026-03-31"
        flighting
        grouped
      />,
    )
    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("true")
    expect(host.textContent).toContain("search line 0")
    expect(host.querySelectorAll("[data-gantt-axis]")).toHaveLength(1)

    act(() => {
      channelButton(host, "Search").click()
    })
    expect(channelButton(host, "Search").getAttribute("aria-expanded")).toBe("false")
    expect(host.textContent).not.toContain("search line 0")
  })

  it("labels October 2026 weeks by Monday start", () => {
    const host = render(
      <MediaGanttChart
        lineItems={{
          search: [line("oct", "October line", "2026-10-05", "2026-10-31")],
        }}
        startDate="2026-10-05"
        endDate="2026-10-31"
        granularity="weekly"
        flighting
        grouped
      />,
    )
    const weeks = [...host.querySelectorAll("[data-gantt-week]")].map((node) => node.textContent)
    const mondays = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]
    const days = ["5", "12", "19", "26"]
    const today = getMelbourneTodayISO()
    const visible = days.filter((_, index) => {
      const start = mondays[index]!
      const end = mondays[index + 1] ?? "2026-11-02"
      return !(today >= start && today < end)
    })
    expect(weeks).toEqual(visible)
    expect(weeks.join("")).not.toMatch(/[A-Za-z]/)
    const months = [...host.querySelectorAll("[data-gantt-month]")].map((node) => node.textContent)
    expect(months).toEqual(["OCT"])
    const month = host.querySelector("[data-gantt-month]")
    const todayBadge = host.querySelector("[data-gantt-today]")
    expect(month?.getAttribute("font-size")).toBe("11")
    expect(todayBadge?.getAttribute("y")).toBe("24")
    expect(Number(todayBadge?.getAttribute("y"))).toBeGreaterThan(Number(month?.getAttribute("y")))
    const groupLabel = host.querySelector("[data-gantt-group-label]")
    const lineLabel = host.querySelector("[data-gantt-line-label]")
    expect(groupLabel?.getAttribute("font-size")).toBe("13")
    expect(lineLabel?.getAttribute("font-size")).toBe("13")
    expect(host.querySelector("[data-gantt-summary-bar]")?.getAttribute("height")).toBe("6")
    expect(host.querySelector("[data-gantt-burst]")?.getAttribute("height")).toBe("20")
    for (const svg of host.querySelectorAll("svg")) {
      const width = svg.getAttribute("width")
      expect(width).not.toBe("100%")
      expect(svg.getAttribute("viewBox")?.startsWith(`0 0 ${width} `)).toBe(true)
    }
    expect(host.querySelector("[data-gantt-axis]")?.className).toContain("sticky")
    expect(host.querySelectorAll("[data-gantt-axis]")).toHaveLength(1)
  })

  it("keeps the PNG clone at the same pixel width as the screen svg", () => {
    const host = render(
      <MediaGanttChart
        lineItems={{
          search: [line("oct", "October line", "2026-10-05", "2026-10-31")],
        }}
        startDate="2026-10-05"
        endDate="2026-10-31"
        granularity="weekly"
        flighting
        grouped
      />,
    )
    const live = host.querySelector("svg")
    const width = live?.getAttribute("width")
    expect(Number(width)).toBeGreaterThanOrEqual(960)
    expect(live?.getAttribute("viewBox")?.startsWith(`0 0 ${width} `)).toBe(true)
    const clone = host.cloneNode(true) as HTMLElement
    prepareMediaPlanExportClone(document, clone)
    const copied = clone.querySelector("svg")
    expect(copied?.getAttribute("width")).toBe(width)
    expect(copied?.getAttribute("viewBox")).toBe(live?.getAttribute("viewBox"))
    expect((clone.querySelector("[data-gantt-scroll]") as HTMLElement).style.overflow).toBe("visible")
    expect((clone.querySelector(".sticky") as HTMLElement).style.position).toBe("relative")
  })
})
