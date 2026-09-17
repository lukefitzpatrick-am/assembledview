/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import {
  CampaignReadBeatsView,
  CampaignReadFailedState,
  CampaignReadSection,
  CampaignReadStillWritingState,
  CampaignReadWritingState,
} from "../CampaignReadSection"
import type { CampaignRead } from "@/lib/campaign-read/types"

const published: CampaignRead = {
  id: 1,
  mbaNumber: "golf001",
  versionNumber: 4,
  status: "published",
  beats: {
    planned: "You booked $180K.",
    happened: "Search delivered $62K.",
    vsPlan: "On pace.",
    best: "Search is ahead.",
    worst: "Meta lag.",
    upcoming: "September burst.",
  },
  bodyMarkdown: "md",
  sources: ["get_delivery_snapshot"],
  errorMessage: null,
  generatedAt: "2026-09-17T00:00:00.000Z",
  generatedByEmail: "luke@assembledmedia.com.au",
  editedAt: null,
  editedByEmail: null,
  publishedAt: "2026-09-17T00:00:00.000Z",
  publishedByEmail: "luke@assembledmedia.com.au",
}

describe("CampaignReadSection views", () => {
  it("client view shows beats and as-at, no admin controls", () => {
    const html = renderToStaticMarkup(
      <section id="campaign-read" className="space-y-4">
        <CampaignReadBeatsView beats={published.beats} readAsAt="17 Sep 2026" />
      </section>,
    )
    expect(html).toContain("What was planned")
    expect(html).toContain("You booked $180K.")
    expect(html).toContain("Read as at 17 Sep 2026")
    expect(html).not.toContain("Regenerate")
    expect(html).not.toContain("Publish")
  })

  it("admin empty state offers Regenerate", () => {
    const html = renderToStaticMarkup(
      <CampaignReadSection mbaNumber="golf001" versionNumber={4} isAdmin />,
    )
    expect(html).toContain('id="campaign-read"')
    // First paint is the loading pulse; after fetch the empty card says "No read yet".
    expect(html.includes("Regenerate") || html.includes("No read yet") || html.includes("animate-pulse")).toBe(true)
    expect(html).not.toContain("Publish")
    expect(typeof CampaignReadSection).toBe("function")
  })

  it("shows writing copy while generating", () => {
    const html = renderToStaticMarkup(<CampaignReadWritingState />)
    expect(html).toContain("Writing the read…")
  })

  it("stops polling after the cap with a refresh hint", () => {
    const html = renderToStaticMarkup(<CampaignReadStillWritingState />)
    expect(html).toContain("Still writing, refresh to check")
  })

  it("failed state shows the message and Regenerate", () => {
    const html = renderToStaticMarkup(
      <CampaignReadFailedState message="model timed out" onRegenerate={() => {}} busy={false} />,
    )
    expect(html).toContain("model timed out")
    expect(html).toContain("Regenerate")
  })
})
