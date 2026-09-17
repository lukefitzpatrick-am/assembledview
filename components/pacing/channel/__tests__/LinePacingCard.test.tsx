/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LinePacingCard } from "@/components/pacing/channel/LinePacingCard"
import {
  lineCardFromAdServing,
  lineCardFromDirect,
  lineCardFromProgrammatic,
  lineCardFromSearch,
  lineCardFromSocial,
} from "@/lib/pacing/channel/lineCardModel"
import {
  LINE_AS_OF,
  adServingFixture,
  directGroupFixture,
  programmaticFixture,
  searchFixture,
  socialFixture,
} from "@/lib/pacing/channel/__tests__/fixtures"

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

describe("LinePacingCard", () => {
  it("renders a search line card", () => {
    const model = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    const html = renderToStaticMarkup(<LinePacingCard model={model} asOf={LINE_AS_OF} />)
    expect(html).toContain("Jayco")
    expect(html).toContain("jayco001se1")
    expect(html).toContain("Time elapsed · line")
    expect(html).toContain("Spend delivered · line")
    expect(html).toContain("Clicks")
    expect(html).toContain("Remaining · line")
    expect(html).toContain(model.why)
    expect(html).toContain(`/dashboard/${model.clientSlug}/${model.mba}`)
    expect(html).toContain("Details")
  })

  it("renders a social line card", () => {
    const model = lineCardFromSocial(socialFixture(), LINE_AS_OF)
    const html = renderToStaticMarkup(<LinePacingCard model={model} asOf={LINE_AS_OF} />)
    expect(html).toContain("Impressions")
    expect(html).toContain("jayco001so1")
  })

  it("renders a programmatic line card", () => {
    const model = lineCardFromProgrammatic(programmaticFixture(), LINE_AS_OF)
    const html = renderToStaticMarkup(<LinePacingCard model={model} asOf={LINE_AS_OF} />)
    expect(html).toContain("DV360")
    expect(html).toContain("jayco001pd1")
  })

  it("renders an ad-serving verification card with no spend", () => {
    const model = lineCardFromAdServing(adServingFixture(), LINE_AS_OF)
    const html = renderToStaticMarkup(<LinePacingCard model={model} asOf={LINE_AS_OF} />)
    expect(html).toContain("Delivered · line")
    expect(html).toContain("Served impressions")
    expect(html).toContain("Verification only")
  })

  it("renders a direct reported-spend card", () => {
    const group = directGroupFixture()
    const model = lineCardFromDirect(group, group.lineItems[0]!, LINE_AS_OF)
    const html = renderToStaticMarkup(<LinePacingCard model={model} asOf={LINE_AS_OF} />)
    expect(html).toContain("Reported")
    expect(html).toContain("jayco001tv1")
    expect(html).toContain("fixed_cost")
  })
})
