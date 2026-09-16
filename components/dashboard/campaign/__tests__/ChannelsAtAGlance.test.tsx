/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { ChannelCoverageEntry } from "@/lib/delivery/channelCoverage"
import { ChannelsAtAGlance } from "../ChannelsAtAGlance"

function entry(partial: Partial<ChannelCoverageEntry> & Pick<ChannelCoverageEntry, "key" | "label" | "status">): ChannelCoverageEntry {
  return {
    colour: "var(--channel-social)",
    plannedSpend: 10_000,
    plannedImpressions: 100_000,
    deliveredSpend: 2_000,
    deliveredImpressions: 20_000,
    spendModelled: false,
    startsOn: null,
    deliveryStatus: "on-track",
    impressionsStatus: "on-track",
    deliverableLabel: "Impressions",
    ...partial,
  }
}

describe("ChannelsAtAGlance", () => {
  it("renders heading, caption, and a reporting progress card", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        entries={[
          entry({
            key: "social-meta",
            label: "Social · Meta",
            status: "reporting",
            deliveryStatus: "ahead",
          }),
        ]}
      />,
    )
    expect(html).toContain("Channels at a glance")
    expect(html).toContain("Delivered vs planned · updated daily")
    expect(html).toContain("Social · Meta")
    expect(html).toContain("Ahead")
    expect(html).toContain("of planned")
    expect(html).not.toContain("Awaiting first report")
  })

  it("shows Connecting and Awaiting first report without a progress bar", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        entries={[
          entry({
            key: "social-reddit",
            label: "Social · Reddit",
            status: "connecting",
            deliveredSpend: 0,
            deliveredImpressions: 0,
            deliveryStatus: null,
          }),
        ]}
      />,
    )
    expect(html).toContain("Connecting")
    expect(html).toContain("Awaiting first report")
    expect(html).not.toContain('data-progress="true"')
  })

  it("shows Starts {date} for not_started groups", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        entries={[
          entry({
            key: "programmatic-video:channel factory",
            label: "Prog Video · Channel Factory",
            status: "not_started",
            startsOn: "2026-06-01",
            deliveredSpend: 0,
            deliveredImpressions: 0,
            deliveryStatus: null,
          }),
        ]}
      />,
    )
    expect(html).toContain("Starts")
    expect(html).toMatch(/Starts 1 Jun(?:e)? 2026/)
  })

  it("renders an em dash for zero-$ spend and a modelled label when flagged", () => {
    const hidden = renderToStaticMarkup(
      <ChannelsAtAGlance
        entries={[
          entry({
            key: "digital-display",
            label: "Digital Display",
            status: "reporting",
            deliveredSpend: null,
            spendModelled: false,
            deliveryStatus: "on-track",
          }),
        ]}
      />,
    )
    expect(hidden).toContain("—")
    expect(hidden).not.toContain("modelled")

    const modelled = renderToStaticMarkup(
      <ChannelsAtAGlance
        entries={[
          entry({
            key: "programmatic-video:twitch",
            label: "Prog Video · Twitch",
            status: "reporting",
            deliveredSpend: 1_500,
            spendModelled: true,
            deliveryStatus: "behind",
          }),
        ]}
      />,
    )
    expect(modelled).toContain("modelled")
    expect(modelled).toContain("Behind")
  })

  it("labels the deliverable Views when the whole group is CPV", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        entries={[
          entry({
            key: "programmatic-video:channel factory",
            label: "Prog Video · Channel Factory",
            status: "reporting",
            deliverableLabel: "Views",
            plannedImpressions: 885_173,
            deliveredImpressions: 86_956,
            deliveryStatus: "behind",
          }),
        ]}
      />,
    )
    expect(html).toContain("Views")
    expect(html).not.toMatch(/>Impressions</)
  })
})
