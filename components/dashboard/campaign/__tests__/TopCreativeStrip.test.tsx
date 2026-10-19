/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import { LineCreativePanelView } from "../LineCreativePanel"
import { TopCreativeStripView } from "../TopCreativeStrip"

function row(partial: Partial<CreativePerformanceRow> & Pick<CreativePerformanceRow, "creativeKey" | "impressions">): CreativePerformanceRow {
  return {
    platform: "meta",
    name: partial.creativeKey,
    lineItemId: "GOLF025SM1",
    lineLabel: "Meta • Players",
    format: { kind: "image", aspect: "1:1" },
    spend: 810,
    clicks: 100,
    ctr: 0.01,
    cpm: 4,
    viewableRate: null,
    vcr: null,
    conversions: null,
    firstDate: "2026-09-01",
    lastDate: "2026-09-14",
    sizes: [],
    adSetId: null,
    adSetName: null,
    videoViews: null,
    videoCompletions: null,
    previewUrl: null,
    previewKind: null,
    viewUrl: null,
    rank: null,
    ...partial,
  }
}

const players = row({
  creativeKey: "players",
  name: "Image · Players to date",
  impressions: 202247,
  clicks: 3302,
  ctr: 3302 / 202247,
})

describe("TopCreativeStripView", () => {
  it("renders the three reasons and a format frame when preview is none", () => {
    const html = renderToStaticMarkup(
      <TopCreativeStripView
        status="ready"
        creatives={[
          players,
          row({ creativeKey: "fairway", impressions: 80000, clicks: 400, ctr: 0.005 }),
          row({
            creativeKey: "reel",
            name: "Video 9:16",
            impressions: 50000,
            clicks: 200,
            format: { kind: "video", aspect: "9:16" },
            vcr: 0.8,
          }),
        ]}
      />,
    )
    expect(html).toContain("Top 3")
    expect(html).toContain("creative.")
    expect(html).toContain("The three ads doing the most for this campaign.")
    expect(html).toContain('data-creative-status="ready"')
    expect(html).toContain('data-creative-reason="Best CTR"')
    expect(html).toContain('data-creative-reason="Most reach"')
    expect(html).toContain('data-creative-reason="Best completion"')
    expect(html).toContain("Image · Players to date")
    expect(html).toContain("1.63% CTR")
    expect(html).toContain('data-creative-preview="none"')
    expect(html).not.toContain("<img")
    expect(html).toContain("Meta · Players")
    expect(html).not.toContain("Meta · Meta")
    expect(html).not.toContain("Meta • Players")
  })

  it("shows the cached image as a lazy 4:5 thumbnail with the creative name as alt", () => {
    const html = renderToStaticMarkup(
      <TopCreativeStripView
        status="ready"
        creatives={[
          { ...players, previewUrl: "/api/creative-previews/meta/players", previewKind: "image" },
          row({
            creativeKey: "reel",
            name: "Video 9:16",
            impressions: 50000,
            clicks: 200,
            format: { kind: "video", aspect: "9:16" },
            vcr: 0.8,
            previewUrl: "/api/creative-previews/meta/reel",
            previewKind: "video",
          }),
        ]}
      />,
    )
    expect(html).toContain('src="/api/creative-previews/meta/players"')
    expect(html).toContain('alt="Image · Players to date"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain("aspect-[4/5]")
    expect(html).toContain("object-cover")
    expect(html.match(/data-creative-play="true"/g)?.length).toBe(1)
  })

  it("shows a skeleton while loading", () => {
    const html = renderToStaticMarkup(<TopCreativeStripView status="loading" creatives={[]} />)
    expect(html).toContain('data-creative-status="loading"')
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain("Best CTR")
  })

  it("says creative data is not set up yet on 503", () => {
    const html = renderToStaticMarkup(<TopCreativeStripView status="unavailable" creatives={[]} />)
    expect(html).toContain("Creative data isn")
    expect(html).toContain("t set up yet")
    expect(html).not.toContain("Retry")
  })

  it("shows an error with retry", () => {
    const html = renderToStaticMarkup(
      <TopCreativeStripView status="error" creatives={[]} onRetry={() => {}} />,
    )
    expect(html).toContain("Creative performance could not be loaded.")
    expect(html).toContain("Retry")
  })

  it("renders nothing when the flag is off", () => {
    const html = renderToStaticMarkup(<TopCreativeStripView status="off" creatives={[players]} />)
    expect(html).toBe("")
  })
})

describe("LineCreativePanelView", () => {
  function lineRows(count: number): CreativePerformanceRow[] {
    return Array.from({ length: count }, (_, index) =>
      row({
        creativeKey: `ad-${index + 1}`,
        name: `Ad ${index + 1}`,
        impressions: 10000 + index,
        clicks: 50 + index,
        ctr: (50 + index) / (10000 + index),
      }),
    )
  }

  it("shows the first six ads and Show all N", () => {
    const html = renderToStaticMarkup(<LineCreativePanelView rows={lineRows(7)} />)
    expect(html).toContain("Creative in this line")
    expect(html).toContain("Show all 7")
    expect(html).toContain("Ad 1")
    expect(html).toContain("Ad 6")
    expect(html).not.toContain("Ad 7")
    expect(html).toContain("$810")
    expect(html).toContain("impressions")
  })

  it("expands to every ad", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    let root: Root | null = null
    await act(async () => {
      root = createRoot(host)
      root.render(<LineCreativePanelView rows={lineRows(7)} />)
    })
    expect(host.textContent).toContain("Show all 7")
    expect(host.textContent).not.toContain("Ad 7")
    const button = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Show all"),
    )
    await act(async () => {
      button?.click()
    })
    expect(host.textContent).toContain("Ad 7")
    expect(host.textContent).not.toContain("Show all 7")
    await act(async () => {
      root?.unmount()
    })
    host.remove()
  })

  it("uses impressions and viewable rate for CM360, and completion for video", () => {
    const html = renderToStaticMarkup(
      <LineCreativePanelView
        rows={[
          row({
            platform: "cm360",
            creativeKey: "placement",
            name: "Placement image",
            impressions: 12000,
            clicks: 80,
            ctr: 80 / 12000,
            spend: null,
            viewableRate: 0.64,
            sizes: ["1080x1080", "1080x1920", "1920x1080", "300x250", "640x360"],
            lineLabel: "CM360 • Display",
          }),
          row({
            creativeKey: "reel",
            name: "Video reel",
            impressions: 11000,
            clicks: 40,
            ctr: 40 / 11000,
            format: { kind: "video", aspect: "9:16" },
            vcr: 0.4,
          }),
        ]}
      />,
    )
    expect(html).toContain("64% viewable")
    expect(html).toContain("1080x1080, 1080x1920, 1920x1080, 300x250, 640x360")
    expect(html).toContain("40% completion")
    expect(html).toContain("0.67% CTR")
  })

  it("renders nothing when the line has no ads", () => {
    const html = renderToStaticMarkup(<LineCreativePanelView rows={[]} />)
    expect(html).toBe("")
  })
})
