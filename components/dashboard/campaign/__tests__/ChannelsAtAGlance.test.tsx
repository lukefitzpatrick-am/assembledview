/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import {
  channelCoverage,
  type ChannelCoverageBuckets,
  type ChannelCoverageEntry,
} from "@/lib/delivery/channelCoverage"
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
    expect(html).toContain("Delivered vs expected to date")
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

  it("reads On track at 98% of expected and Behind at 44%", () => {
    const social = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO="2026-10-12"
        entries={[
          entry({
            key: "social-meta",
            label: "Social · Meta",
            status: "reporting",
            deliveredSpend: 98,
            expectedToDate: 100,
            plannedSpend: 200,
            deliveryStatus: "behind",
          }),
        ]}
      />,
    )
    expect(social).toContain("On track")
    expect(social).toContain("expected to date")
    expect(social).toContain("planned in total")

    const display = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO="2026-10-12"
        entries={[
          entry({
            key: "digital-display",
            label: "Digital Display",
            status: "reporting",
            deliveredSpend: 44,
            expectedToDate: 100,
            plannedSpend: 200,
            deliveryStatus: "on-track",
            spendEstimated: true,
          }),
        ]}
      />,
    )
    expect(display).toContain("Behind")
    expect(display).toContain("Estimated")
    // The bar is delivered ÷ expected (44 of 100), not ÷ planned, and has no marker.
    expect(display).not.toContain('data-expected-marker="true"')
    expect(display).toContain("width:44%")
  })

  it("shows impressions against expected with the planned total as information", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO="2026-10-20"
        entries={[
          entry({
            key: "digital-display",
            label: "Digital Display",
            status: "reporting",
            deliveredImpressions: 372_723,
            expectedImpressions: 335_613,
            plannedImpressions: 2_862_402,
            deliveredSpend: 6_392.2,
            expectedToDate: 5_755.77,
            plannedSpend: 20_145.18,
          }),
        ]}
      />,
    )
    expect(html).toContain("of 335,613 expected to date")
    expect(html).toContain("2,862,402 planned in total")
    expect(html).not.toContain("of planned")
  })

  it("says in period when a date filter narrows the window", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        periodLabel="in period"
        entries={[
          entry({
            key: "social-meta",
            label: "Social · Meta",
            status: "reporting",
            deliveredSpend: 50,
            expectedToDate: 100,
            expectedImpressions: 1_000,
          }),
        ]}
      />,
    )
    expect(html).toContain("Delivered vs expected in period")
    expect(html).toContain("expected in period")
    expect(html).not.toContain("expected to date")
  })

  it("shows Newspaper with no source and no pace pill", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO="2026-10-12"
        entries={[
          entry({
            key: "newspaper",
            label: "Newspaper",
            status: "no_source",
            deliveredSpend: null,
            expectedToDate: 12_952.09,
            plannedSpend: 30_000,
            deliveryStatus: null,
            spendAssumed: false,
          }),
        ]}
      />,
    )
    expect(html).toContain("Newspaper")
    expect(html).toContain("No source")
    expect(html).not.toContain("On track")
    expect(html).not.toContain("Behind")
    expect(html).not.toContain("Ahead")
  })

  it("labels Not started when expected is 0 and the start is still ahead", () => {
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO="2026-10-12"
        entries={[
          entry({
            key: "cinema",
            label: "Cinema",
            status: "no_source",
            startsOn: "2026-11-01",
            expectedToDate: 0,
            deliveredSpend: null,
            deliveryStatus: null,
          }),
        ]}
      />,
    )
    expect(html).toContain("Not started")
  })

  const golfToday = "2026-10-14"

  function emptyBuckets(): ChannelCoverageBuckets {
    return {
      socialLineItems: [],
      searchLineItems: [],
      progDisplayLineItems: [],
      progVideoLineItems: [],
      progOohLineItems: [],
      digitalDisplayLineItems: [],
      digitalVideoLineItems: [],
      digitalAudioLineItems: [],
      bvodLineItems: [],
    }
  }

  function zeroBurstLine(id: string, start: string) {
    return {
      line_item_id: id,
      budget: 0,
      buy_type: "package_inclusions",
      bursts: [{ startDate: start, endDate: "2026-12-31T13:00:00.000Z", budget: 0 }],
    }
  }

  function paidBurstLine(id: string, start: string, budget: number, buyType: string) {
    return {
      line_item_id: id,
      budget,
      buy_type: buyType,
      bursts: [{ startDate: start, endDate: "2026-12-31T13:00:00.000Z", budget }],
    }
  }

  it("shows Not started for golf025 radio instead of On track at $0 of $0", () => {
    const buckets = emptyBuckets()
    buckets.offlineLineItems = [
      ...Array.from({ length: 36 }, (_, index) =>
        zeroBurstLine(`golf025RA${index + 1}`, "2026-10-04T13:00:00.000Z"),
      ),
      paidBurstLine("golf025RA37", "2026-11-15T13:00:00.000Z", 8_000, "spots"),
    ]
    const radio = channelCoverage({
      buckets,
      sections: [],
      todayISO: golfToday,
      channelExpected: [{ key: "radio", expected: 0, planned: 8_000 }],
    }).find((row) => row.key === "radio")
    expect(radio).toBeTruthy()
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance todayISO={golfToday} entries={[radio!]} />,
    )
    expect(html).toContain("Not started")
    expect(html).toContain("Starts 16 Nov 2026")
    expect(html).toContain("Assumed spend")
    expect(html).not.toContain("On track")
    expect(html).not.toContain("Impressions")
    expect(html).not.toContain("of planned")
  })

  it("shows the paid OOH package start, not the $0 inclusion", () => {
    const buckets = emptyBuckets()
    buckets.offlineLineItems = [
      zeroBurstLine("golf025OH1", "2026-10-31T13:00:00.000Z"),
      paidBurstLine("golf025OH2", "2026-11-21T13:00:00.000Z", 22_000, "package"),
    ]
    const ooh = channelCoverage({
      buckets,
      sections: [],
      todayISO: golfToday,
      channelExpected: [{ key: "ooh", expected: 0, planned: 22_000 }],
    }).find((row) => row.key === "ooh")
    expect(ooh).toBeTruthy()
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance todayISO={golfToday} entries={[ooh!]} />,
    )
    expect(html).toContain("Not started")
    expect(html).toContain("Starts 22 Nov 2026")
    expect(html).not.toContain("Starts 1 Nov 2026")
    expect(html).not.toContain("On track")
  })

  it("shows Not started for a digital group whose paid flight is still ahead", () => {
    const buckets = emptyBuckets()
    buckets.socialLineItems = [
      { ...zeroBurstLine("golf025SM1", "2026-10-04T13:00:00.000Z"), platform: "Meta" },
      { ...paidBurstLine("golf025SM2", "2026-11-15T13:00:00.000Z", 4_000, "cpm"), platform: "Meta" },
    ]
    const meta = channelCoverage({
      buckets,
      sections: [],
      todayISO: golfToday,
    }).find((row) => row.key === "social-meta")
    expect(meta?.status).toBe("connecting")
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance todayISO={golfToday} entries={[meta!]} />,
    )
    expect(html).toContain("Not started")
    expect(html).toContain("Starts 16 Nov 2026")
    expect(html).not.toContain("Awaiting first report")
    expect(html).not.toContain("On track")
  })

  it("keeps On track for an assumed channel that has started and expected above 0", () => {
    const buckets = emptyBuckets()
    buckets.offlineLineItems = [paidBurstLine("golf025RA1", "2026-10-01", 1_000, "spots")]
    const radio = channelCoverage({
      buckets,
      sections: [],
      todayISO: golfToday,
      channelExpected: [{ key: "radio", expected: 400, planned: 1_000 }],
      assumedLines: [
        {
          id: "golf025RA1",
          scheduleKey: "radio",
          plannedMedia: 400,
          buyType: "spots",
          bursts: [
            {
              rawBudget: 400,
              budgetIncludesFees: false,
              clientPaysForMedia: true,
              feePct: 0,
              buyType: "spots",
              startDate: "2026-10-01",
              endDate: "2026-10-01",
            },
          ],
        },
      ],
    }).find((row) => row.key === "radio")
    expect(radio).toBeTruthy()
    const html = renderToStaticMarkup(
      <ChannelsAtAGlance todayISO={golfToday} entries={[radio!]} />,
    )
    expect(html).toContain("On track")
    expect(html).not.toContain("Not started")
  })

  it("hides a zero impressions block and keeps it when either count is above 0", () => {
    const hidden = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO={golfToday}
        entries={[
          entry({
            key: "television",
            label: "Television",
            status: "reporting",
            spendAssumed: true,
            plannedImpressions: 0,
            deliveredImpressions: 0,
            deliveredSpend: 100,
            expectedToDate: 100,
          }),
        ]}
      />,
    )
    expect(hidden).not.toContain("Impressions")
    expect(hidden).not.toContain("of planned")

    const deliveredOnly = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO={golfToday}
        entries={[
          entry({
            key: "television",
            label: "Television",
            status: "reporting",
            plannedImpressions: 0,
            deliveredImpressions: 12,
            deliveredSpend: 100,
            expectedToDate: 100,
          }),
        ]}
      />,
    )
    expect(deliveredOnly).toContain("Impressions")
    expect(deliveredOnly).toContain("of planned")

    const plannedOnly = renderToStaticMarkup(
      <ChannelsAtAGlance
        todayISO={golfToday}
        entries={[
          entry({
            key: "television",
            label: "Television",
            status: "reporting",
            plannedImpressions: 8,
            deliveredImpressions: 0,
            deliveredSpend: 100,
            expectedToDate: 100,
          }),
        ]}
      />,
    )
    expect(plannedOnly).toContain("Impressions")
    expect(plannedOnly).toContain("of planned")
  })
})
