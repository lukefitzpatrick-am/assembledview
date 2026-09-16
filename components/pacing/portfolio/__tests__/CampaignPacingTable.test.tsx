/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CampaignPacingTable } from "@/components/pacing/portfolio/CampaignPacingTable"
import { p6FixtureRows } from "@/lib/pacing/portfolio/__tests__/p6Fixture"

function campaignMbas(container: HTMLElement): string[] {
  return [...container.querySelectorAll('tr[data-level="campaign"]')].map(
    (row) => row.getAttribute("data-mba") ?? "",
  )
}

describe("CampaignPacingTable", () => {
  const rows = p6FixtureRows()
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("expands and collapses channel rows; keeps expand while filters change", () => {
    function Harness({ visible }: { visible: typeof rows }) {
      return <CampaignPacingTable rows={visible} />
    }

    act(() => {
      root.render(<Harness visible={rows} />)
    })
    expect(container.querySelectorAll('tr[data-level="channel"]')).toHaveLength(0)

    const jayco = rows.find((row) => row.mbaNumber === "jayco001")!
    const expand = container.querySelector(
      `button[aria-label="Expand ${jayco.mbaNumber}"]`,
    ) as HTMLButtonElement
    expect(expand).toBeTruthy()

    act(() => {
      expand.click()
    })
    expect(container.querySelectorAll('tr[data-level="channel"]')).toHaveLength(
      jayco.channels.length,
    )
    expect(container.textContent).toContain(jayco.channels[0]!.label)

    act(() => {
      root.render(<Harness visible={rows.filter((row) => row.mbaNumber !== "letsgo001")} />)
    })
    expect(container.querySelectorAll('tr[data-level="channel"]')).toHaveLength(
      jayco.channels.length,
    )

    const collapse = container.querySelector(
      `button[aria-label="Collapse ${jayco.mbaNumber}"]`,
    ) as HTMLButtonElement
    act(() => {
      collapse.click()
    })
    expect(container.querySelectorAll('tr[data-level="channel"]')).toHaveLength(0)
  })

  it("sorts by Spent descending on first click", () => {
    act(() => {
      root.render(<CampaignPacingTable rows={rows} />)
    })
    expect(campaignMbas(container)).toEqual(rows.map((row) => row.mbaNumber))

    const spent = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Spent"),
    )
    expect(spent).toBeTruthy()
    act(() => {
      spent!.click()
    })

    const expected = [...rows]
      .toSorted((a, b) => b.spendToDate - a.spendToDate)
      .map((row) => row.mbaNumber)
    expect(campaignMbas(container)).toEqual(expected)
  })
})
