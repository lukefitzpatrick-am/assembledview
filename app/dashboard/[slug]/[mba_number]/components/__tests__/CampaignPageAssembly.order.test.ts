import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../CampaignPageAssembly.tsx"),
  "utf8",
)

function sectionBoundaryTitles(src: string): string[] {
  return [...src.matchAll(/<SectionBoundary title="([^"]+)"/g)].map((m) => m[1]!)
}

function enterDelays(src: string): number[] {
  return [...src.matchAll(/animationDelay:\s*"(\d+)ms"/g)].map((m) => Number(m[1]))
}

describe("CampaignPageAssembly section order", () => {
  it("places Delivery before Media plan and The plan", () => {
    expect(sectionBoundaryTitles(source)).toEqual([
      "Campaign hero",
      "Planned audience",
      "Where we are",
      "Channels at a glance",
      "Team hours",
      "KPI pacing",
      "Recent insights",
      "Delivery",
      "Media plan",
      "The plan",
    ])
  })

  it("keeps campaign-section-enter delays ascending", () => {
    const delays = enterDelays(source)
    expect(delays.length).toBeGreaterThan(1)
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]!)
    }
  })
})
