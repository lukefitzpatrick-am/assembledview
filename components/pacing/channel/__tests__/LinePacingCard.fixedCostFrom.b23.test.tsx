/** @vitest-environment jsdom */
/**
 * B23 FC11 and FC12: a dated fixed-cost line shows one card with a
 * "Fixed cost from" note, for admins only. No date: no note, no key.
 */
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

let admin = true
vi.mock("@/contexts/AuthContext", () => ({ useIsAdmin: () => admin }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))

import { LinePacingCard } from "@/components/pacing/channel/LinePacingCard"
import { lineCardFromProgrammatic, lineCardFromSocial } from "@/lib/pacing/channel/lineCardModel"
import { LINE_AS_OF, programmaticFixture, socialFixture } from "@/lib/pacing/channel/__tests__/fixtures"

describe("fixed cost from note on the pacing card", () => {
  it("programmatic and social cards carry the date only when the row has one", () => {
    const dated = lineCardFromProgrammatic(
      programmaticFixture({ fixedCostMedia: true, fixedCostFrom: "2026-09-15" }),
      LINE_AS_OF,
    )
    expect(dated.fixedCostFrom).toBe("2026-09-15")
    const plain = lineCardFromProgrammatic(programmaticFixture({ fixedCostMedia: true }), LINE_AS_OF)
    expect("fixedCostFrom" in plain).toBe(false)
    const social = lineCardFromSocial(socialFixture({ fixedCostMedia: true, fixedCostFrom: "2026-09-15" }), LINE_AS_OF)
    expect(social.fixedCostFrom).toBe("2026-09-15")
  })

  it("admins see the note; others don't; no date, no note", () => {
    const model = lineCardFromProgrammatic(
      programmaticFixture({ fixedCostMedia: true, fixedCostFrom: "2026-09-15" }),
      LINE_AS_OF,
    )
    admin = true
    expect(renderToStaticMarkup(<LinePacingCard model={model} asOf={LINE_AS_OF} />)).toContain(
      "Fixed cost from 15 Sep 2026. Earlier days show actual delivery.",
    )
    admin = false
    expect(renderToStaticMarkup(<LinePacingCard model={model} asOf={LINE_AS_OF} />)).not.toContain("Fixed cost from")
    admin = true
    const plain = lineCardFromProgrammatic(programmaticFixture({ fixedCostMedia: true }), LINE_AS_OF)
    expect(renderToStaticMarkup(<LinePacingCard model={plain} asOf={LINE_AS_OF} />)).not.toContain("Fixed cost from")
  })
})
