/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { p6FixtureRows, P6_AS_OF } from "@/lib/pacing/portfolio/__tests__/p6Fixture"
import { CampaignPacingCard } from "@/components/pacing/portfolio/CampaignPacingCard"

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

describe("CampaignPacingCard", () => {
  const rows = p6FixtureRows()
  const byMba = Object.fromEntries(rows.map((row) => [row.mbaNumber, row]))

  it("renders the P6 BICAU002 on-track card", () => {
    const row = byMba.BICAU002!
    const html = renderToStaticMarkup(
      <CampaignPacingCard row={row} asOf={P6_AS_OF} />,
    )
    expect(html).toContain("Penfolds")
    expect(html).toContain("Penfolds Always On")
    expect(html).toContain("BICAU002")
    expect(html).toContain("On track")
    expect(html).toContain("Time elapsed")
    expect(html).toContain("Spend delivered")
    expect(html).toContain("Expected by now")
    expect(html).toContain("Days left")
    expect(html).toContain("Daily rate")
    expect(html).toContain("1 of 1")
    expect(html).toContain("BVOD")
    expect(html).toContain(row.why)
    expect(html).toContain(`/dashboard/${row.clientSlug}/BICAU002`)
    expect(html).toContain("Open campaign")
    expect(html).toContain(`dateTime="${P6_AS_OF}"`)
  })

  it("hides the why line when asked", () => {
    const row = byMba.letsgo001!
    const html = renderToStaticMarkup(
      <CampaignPacingCard row={row} asOf={P6_AS_OF} showWhy={false} muted />,
    )
    expect(html).not.toContain(row.why)
    expect(html).toContain("Over-pacing")
    expect(html).toContain("Projected finish")
    expect(html).toContain("opacity-75")
  })
})
