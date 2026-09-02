/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { STUB_PLANNING_CHANNELS } from "@/lib/planning/upload/__tests__/planningDimStub"

import { UploadCoveragePanel } from "../UploadCoveragePanel"

const OOH_LEAVES = ["ooh_street", "ooh_billboard", "ooh_shopping", "ooh_transit"]
const SOCIAL_LEAVES = ["facebook", "instagram"]
const NEWS_LEAVES = ["news_print", "news_digital"]
const MAG_LEAVES = ["mags_print", "mags_digital"]

const uncoveredLeafIds = [
  ...OOH_LEAVES,
  ...SOCIAL_LEAVES,
  ...NEWS_LEAVES,
  ...MAG_LEAVES,
]

const coveredIds = new Set(["ooh_total", "social_total", "news_total", "mags_total"])

function count(html: string, needle: string): number {
  if (!needle) return 0
  return html.split(needle).length - 1
}

describe("UploadCoveragePanel inherit affordance", () => {
  it("offers inherit once per uncovered group, not per leaf", () => {
    const html = renderToStaticMarkup(
      <UploadCoveragePanel
        scoreableCount={4}
        leafCount={21}
        uncoveredLeafIds={uncoveredLeafIds}
        coveredIds={coveredIds}
        channels={STUB_PLANNING_CHANNELS}
        filterLabel="All cases"
        options={{ inheritRollupIds: [], benchmarkOnlyIds: [] }}
        onChangeOptions={() => {}}
      />,
    )

    expect(count(html, "Inherit Outdoor reach and index for the 4 uncovered channels below")).toBe(
      1,
    )
    expect(count(html, "Inherit Social reach and index for the 2 uncovered channels below")).toBe(1)
    expect(count(html, "Inherit News reach and index for the 2 uncovered channels below")).toBe(1)
    expect(
      count(html, "Inherit Magazines reach and index for the 2 uncovered channels below"),
    ).toBe(1)
    expect(html).not.toContain("Inherit from Outdoor")
    expect(count(html, "Include on benchmark only")).toBe(10)
  })

  it("greys inherited leaves and keeps benchmark-only per leaf but disabled", () => {
    const html = renderToStaticMarkup(
      <UploadCoveragePanel
        scoreableCount={8}
        leafCount={21}
        uncoveredLeafIds={uncoveredLeafIds}
        coveredIds={coveredIds}
        channels={STUB_PLANNING_CHANNELS}
        filterLabel="All cases"
        options={{ inheritRollupIds: ["ooh_total"], benchmarkOnlyIds: ["ooh_street"] }}
        onChangeOptions={() => {}}
      />,
    )

    expect(count(html, "inherited from Outdoor")).toBe(4)
    expect(html).not.toContain("inherited from Social")
    expect(html).not.toContain("Takes budget, contributes zero measured reach")
  })
})
