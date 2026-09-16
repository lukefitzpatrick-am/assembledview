/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { p6FixtureRows, P6_AS_OF } from "@/lib/pacing/portfolio/__tests__/p6Fixture"
import { countPortfolioRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { splitPortfolioSections } from "@/lib/pacing/portfolio/filterPortfolioRows"
import { PortfolioCardsBoard } from "@/components/pacing/portfolio/PortfolioCardsBoard"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children?: React.ReactNode
  } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))

describe("PortfolioCardsBoard", () => {
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

  it("splits sections from the P6 fixture", () => {
    const { attention, rest } = splitPortfolioSections(rows)
    expect(attention.map((row) => row.mbaNumber)).toEqual([
      "letsgo001",
      "jayco001",
      "candel001",
      "hartm012",
    ])
    expect(rest.map((row) => row.mbaNumber)).toEqual(["PGAAUS014", "BICAU002"])

    act(() => {
      root.render(
        <PortfolioCardsBoard
          rows={rows}
          asOf={P6_AS_OF}
          counts={countPortfolioRows(rows)}
        />,
      )
    })
    expect(container.textContent).toContain("Needs a look today")
    expect(container.textContent).toContain("Everything else")
    expect(container.textContent).toContain("Lets Go Over")
    expect(container.textContent).toContain("Penfolds Always On")
    expect(container.querySelector('[aria-label="Everything else"]')?.innerHTML).not.toContain(
      rows.find((row) => row.mbaNumber === "BICAU002")!.why,
    )
  })

  it("clicking a tile filters the list; clicking again clears", () => {
    act(() => {
      root.render(
        <PortfolioCardsBoard
          rows={rows}
          asOf={P6_AS_OF}
          counts={countPortfolioRows(rows)}
        />,
      )
    })

    const behind = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Behind"),
    )
    expect(behind).toBeTruthy()

    act(() => {
      behind!.click()
    })
    expect(behind!.getAttribute("aria-pressed")).toBe("true")
    expect(container.textContent).toContain("Jayco Mixed")
    expect(container.textContent).not.toContain("Lets Go Over")
    expect(container.textContent).not.toContain("Penfolds Always On")
    expect(container.querySelector('[aria-label="Everything else"]')).toBeNull()

    act(() => {
      behind!.click()
    })
    expect(behind!.getAttribute("aria-pressed")).toBe("false")
    expect(container.textContent).toContain("Lets Go Over")
    expect(container.textContent).toContain("Penfolds Always On")
  })
})
