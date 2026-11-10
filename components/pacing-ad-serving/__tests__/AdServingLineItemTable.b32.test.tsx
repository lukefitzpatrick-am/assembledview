/** @vitest-environment jsdom */
/**
 * B32: the Ad Serving tab (table and cards) labels a Channel Factory row
 * partner-reported and leaves a CM360 row as it was.
 */
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { AdServingLineItemTable } from "@/components/pacing-ad-serving/AdServingLineItemTable"
import { LinePacingCard } from "@/components/pacing/channel/LinePacingCard"
import { lineCardFromAdServing } from "@/lib/pacing/channel/lineCardModel"
import { COUNT_TO, cm360Rows, partnerRows } from "@/lib/pacing/ad-serving/__tests__/b32Fixtures"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))

describe("B32 Ad Serving tab partner label", () => {
  it("table: the partner row carries the label, the CM360 row does not", () => {
    const cm = cm360Rows()[0]!
    const pf = partnerRows()[0]!
    const both = renderToStaticMarkup(<AdServingLineItemTable rows={[cm, pf]} asOfDate={COUNT_TO} />)
    expect(both.match(/Partner-reported \(Channel Factory\)/g)?.length).toBe(1)
    const cmOnly = renderToStaticMarkup(<AdServingLineItemTable rows={[cm]} asOfDate={COUNT_TO} />)
    expect(cmOnly).not.toMatch(/Partner-reported/)
  })

  it("cards: the partner card says Partner-reported and Channel Factory, never CM360", () => {
    const html = renderToStaticMarkup(
      <LinePacingCard model={lineCardFromAdServing(partnerRows()[0]!, COUNT_TO)} asOf={COUNT_TO} />,
    )
    expect(html).toMatch(/Partner-reported/)
    expect(html).toMatch(/Channel Factory/)
    expect(html).not.toMatch(/CM360/)
    expect(html).not.toMatch(/Verification only/)
    const cmHtml = renderToStaticMarkup(
      <LinePacingCard model={lineCardFromAdServing(cm360Rows()[0]!, COUNT_TO)} asOf={COUNT_TO} />,
    )
    expect(cmHtml).toMatch(/Verification only/)
    expect(cmHtml).not.toMatch(/Partner-reported/)
  })
})
