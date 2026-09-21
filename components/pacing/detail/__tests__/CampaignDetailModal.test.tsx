/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CampaignPacingCard } from "@/components/pacing/portfolio/CampaignPacingCard"
import { CampaignPacingTable } from "@/components/pacing/portfolio/CampaignPacingTable"
import { CampaignDetailModal } from "@/components/pacing/detail/CampaignDetailModal"
import { CampaignDetailProvider } from "@/components/pacing/detail/CampaignDetailContext"
import { PacingFilterProvider } from "@/lib/pacing/usePacingFilterStore"
import { lineCardFromSearch } from "@/lib/pacing/channel/lineCardModel"
import { searchFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import { assembleCampaignDetailPayload } from "@/lib/pacing/detail/assembleCampaignDetailPayload"
import { p6FixtureRows, P6_AS_OF } from "@/lib/pacing/portfolio/__tests__/p6Fixture"

function fixturePayload() {
  const row = p6FixtureRows().find((item) => item.mbaNumber === "BICAU002")!
  const line = lineCardFromSearch(
    searchFixture({ mbaNumber: row.mbaNumber, campaignName: row.campaignName }),
    P6_AS_OF,
  )
  return assembleCampaignDetailPayload({
    row,
    lines: [{ ...line, cpm: null, views: null, buyType: null, fixedCost: false }],
    asOf: P6_AS_OF,
  })
}

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <PacingFilterProvider initialAssignedClientIds={[]}>
      <CampaignDetailProvider>{children}</CampaignDetailProvider>
    </PacingFilterProvider>
  )
}

describe("CampaignDetailModal", () => {
  const payload = fixturePayload()
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => payload,
      }),
    )
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
    window.history.replaceState({}, "", "/pacing/portfolio")
  })

  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it("opens from a portfolio card and closes on Escape", async () => {
    act(() => {
      root.render(
        <Harness>
          <CampaignPacingCard row={payload.row} asOf={P6_AS_OF} />
        </Harness>,
      )
    })
    const open = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Open campaign"),
    )
    expect(open).toBeTruthy()
    act(() => {
      open!.click()
    })
    await settle()
    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain("Overview")
    expect(window.location.search).toContain("campaign=BICAU002")

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    await settle()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(window.location.search).not.toContain("campaign=")
  })

  it("opens from the table View action", async () => {
    act(() => {
      root.render(
        <Harness>
          <CampaignPacingTable rows={[payload.row]} />
        </Harness>,
      )
    })
    const view = [...container.querySelectorAll("button")].find((el) => el.textContent === "View")
    expect(view).toBeTruthy()
    act(() => {
      view!.click()
    })
    await settle()
    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain("BICAU002")
  })

  it("reopens from ?campaign=", async () => {
    window.history.replaceState({}, "", "/pacing/portfolio?campaign=BICAU002")
    act(() => {
      root.render(
        <Harness>
          <div />
        </Harness>,
      )
    })
    await settle()
    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain("Open client dashboard")
  })

  it("hides all-empty columns on the Lines tab", () => {
    act(() => {
      root.render(
        <CampaignDetailModal
          mba={payload.row.mbaNumber}
          asOf={P6_AS_OF}
          payload={payload}
          loading={false}
          error={null}
          onClose={() => {}}
          onReload={() => {}}
        />,
      )
    })
    const linesTab = [...container.querySelectorAll("button")].find((el) => el.textContent === "Lines")
    act(() => {
      linesTab!.click()
    })
    const headers = [...container.querySelectorAll("th")].map((el) => el.textContent)
    expect(headers).toContain("Line")
    expect(headers).toContain("Clicks")
    expect(headers).not.toContain("CPM")
    expect(headers).not.toContain("Views")
    expect(headers).not.toContain("Buy type")
  })

  it("scrolls the Lines table horizontally with a sticky LINE column", () => {
    act(() => {
      root.render(
        <CampaignDetailModal
          mba={payload.row.mbaNumber}
          asOf={P6_AS_OF}
          payload={payload}
          loading={false}
          error={null}
          onClose={() => {}}
          onReload={() => {}}
        />,
      )
    })
    const linesTab = [...container.querySelectorAll("button")].find((el) => el.textContent === "Lines")
    act(() => {
      linesTab!.click()
    })
    const table = container.querySelector("table")
    expect(table?.parentElement?.className).toMatch(/overflow-x-auto/)
    const firstTh = container.querySelector("thead th")
    const firstTd = container.querySelector("tbody td")
    expect(firstTh?.className).toMatch(/sticky/)
    expect(firstTd?.className).toMatch(/sticky/)
    expect(firstTd?.querySelector(".font-mono")?.textContent).toBe(payload.lines[0]?.lineItemId)
    const description = firstTd?.querySelector("[title]")
    expect(description?.getAttribute("title")).toContain(payload.lines[0]?.campaignName ?? "")
    expect(description?.getAttribute("title")).toContain("search · Google Ads")
  })

  it("groups KPIs under a header per line", () => {
    const row = p6FixtureRows().find((item) => item.mbaNumber === "BICAU002")!
    const brand = lineCardFromSearch(
      searchFixture({
        mbaNumber: row.mbaNumber,
        campaignName: "Brand search",
        lineItemId: "bicau002se1",
      }),
      P6_AS_OF,
    )
    const generic = lineCardFromSearch(
      searchFixture({
        mbaNumber: row.mbaNumber,
        campaignName: "Generic search",
        lineItemId: "bicau002se2",
        buyType: "cpm",
      }),
      P6_AS_OF,
    )
    const twoLinePayload = assembleCampaignDetailPayload({
      row,
      lines: [brand, generic],
      asOf: P6_AS_OF,
    })
    act(() => {
      root.render(
        <CampaignDetailModal
          mba={row.mbaNumber}
          asOf={P6_AS_OF}
          payload={twoLinePayload}
          loading={false}
          error={null}
          onClose={() => {}}
          onReload={() => {}}
        />,
      )
    })
    const kpisTab = [...container.querySelectorAll("button")].find((el) => el.textContent === "KPIs")
    act(() => {
      kpisTab!.click()
    })
    const grid = container.querySelector('[class*="min-[800px]:grid-cols-2"]')
    expect(grid).toBeTruthy()
    const sections = [...container.querySelectorAll("[data-kpi-line]")]
    expect(sections).toHaveLength(2)
    expect(sections[0]?.getAttribute("data-kpi-line")).toBe("bicau002se1")
    expect(sections[0]?.textContent).toContain("Brand search")
    expect(sections[0]?.textContent).toContain("search · Google Ads")
    expect([...sections[0]!.querySelectorAll("tbody tr")].map((el) => el.textContent)).toEqual(
      expect.arrayContaining(["CTR", "Conversion Rate"].map((label) => expect.stringContaining(label))),
    )
    expect(sections[1]?.getAttribute("data-kpi-line")).toBe("bicau002se2")
    expect(sections[1]?.textContent).toContain("Generic search")
    expect(sections[1]?.textContent).toContain("cpm")
    expect(sections[0]?.textContent).not.toContain("Generic search")
    expect(sections[1]?.textContent).not.toContain("Brand search")
  })

  it("shows an explicit empty Daily state instead of a blank chart", () => {
    act(() => {
      root.render(
        <CampaignDetailModal
          mba={payload.row.mbaNumber}
          asOf={P6_AS_OF}
          payload={payload}
          loading={false}
          error={null}
          onClose={() => {}}
          onReload={() => {}}
        />,
      )
    })
    const dailyTab = [...container.querySelectorAll("button")].find((el) => el.textContent === "Daily")
    act(() => {
      dailyTab!.click()
    })
    expect(container.textContent).toContain("No daily rows for this campaign")
  })
})
