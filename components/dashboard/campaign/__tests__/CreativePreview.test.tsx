/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"

import { EntityBreakdownTable } from "@/components/dashboard/delivery/shared/EntityBreakdownTable"
import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import { CreativeFormatThumb } from "../CreativeFormatThumb"
import { CreativePreviewBody } from "../CreativePreviewSheet"
import { LineCreativePanelView } from "../LineCreativePanel"

function row(partial: Partial<CreativePerformanceRow> & Pick<CreativePerformanceRow, "creativeKey" | "impressions">): CreativePerformanceRow {
  return {
    platform: "meta",
    name: partial.creativeKey,
    lineItemId: "GOLF025SM1",
    lineLabel: "Meta • Avid Golfers — Handicap custom audiences",
    format: { kind: "image", aspect: "1:1" },
    spend: 100,
    clicks: 50,
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
    videoUrl: null,
    rank: null,
    ...partial,
  }
}

let cleanup: (() => Promise<void>) | null = null
afterEach(async () => {
  await cleanup?.()
  cleanup = null
})

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div")
  document.body.appendChild(host)
  let root: Root | null = null
  await act(async () => {
    root = createRoot(host)
    root.render(node)
  })
  cleanup = async () => {
    await act(async () => {
      root?.unmount()
    })
    host.remove()
  }
  return host
}

describe("CreativeFormatThumb", () => {
  it("falls back to the format tile with no preview", () => {
    const html = renderToStaticMarkup(
      <CreativeFormatThumb format={{ kind: "image", aspect: "1:1" }} previewUrl={null} size="card" name="Ad" />,
    )
    expect(html).toContain('data-creative-preview="none"')
    expect(html).not.toContain("<img")
  })

  it("renders a lazy row thumbnail and falls back when the image fails", async () => {
    const host = await mount(
      <CreativeFormatThumb
        format={{ kind: "image", aspect: "1:1" }}
        previewUrl="/api/creative-previews/meta/1"
        size="row"
        name="Fairway"
      />,
    )
    const img = host.querySelector("img")
    expect(img?.getAttribute("loading")).toBe("lazy")
    expect(img?.getAttribute("alt")).toBe("Fairway")
    expect(img?.parentElement?.className).toContain("size-10")
    await act(async () => {
      img?.dispatchEvent(new Event("error"))
    })
    expect(host.querySelector("img")).toBeNull()
    expect(host.querySelector('[data-creative-preview="none"]')).not.toBeNull()
  })

  it("badges video, including a video format with no cached kind", () => {
    const video = renderToStaticMarkup(
      <CreativeFormatThumb format={{ kind: "image", aspect: null }} previewUrl="/x" previewKind="video" size="card" />,
    )
    const inferred = renderToStaticMarkup(
      <CreativeFormatThumb format={{ kind: "video", aspect: "9:16" }} previewUrl="/x" previewKind={null} size="card" />,
    )
    const image = renderToStaticMarkup(
      <CreativeFormatThumb format={{ kind: "video", aspect: "9:16" }} previewUrl="/x" previewKind="image" size="card" />,
    )
    expect(video).toContain('data-creative-play="true"')
    expect(inferred).toContain('data-creative-play="true"')
    expect(image).not.toContain('data-creative-play="true"')
  })
})

describe("CreativePreviewBody", () => {
  it("shows the image, platform once, ad set, window figures and the Facebook link", () => {
    const html = renderToStaticMarkup(
      <CreativePreviewBody
        creative={row({
          creativeKey: "reel",
          name: "Players reel",
          impressions: 20000,
          clicks: 200,
          ctr: 0.01,
          spend: 400,
          adSetName: "Avid Golfers",
          videoViews: 9000,
          videoCompletions: 3000,
          previewUrl: "/api/creative-previews/meta/reel",
          previewKind: "video",
          viewUrl: "https://fb.me/abc",
        })}
      />,
    )
    expect(html).toContain('src="/api/creative-previews/meta/reel"')
    expect(html).toContain('alt="Players reel"')
    expect(html).toContain("Meta · Avid Golfers — Handicap custom audiences")
    expect(html.match(/Meta/g)?.length).toBe(1)
    expect(html).toContain("Ad set")
    expect(html).toContain("Avid Golfers</dd>")
    for (const text of ["Spend", "$400.00", "Impressions", "20,000", "Clicks", "CTR", "1.00%", "CPC", "$2.00"]) {
      expect(html).toContain(text)
    }
    expect(html).toContain("Video views")
    expect(html).toContain("9,000")
    expect(html).toContain("Video completions")
    expect(html).toContain("3,000")
    expect(html).toContain('href="https://fb.me/abc"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain("View ad on Facebook")
    expect(html).toContain("(opens in a new tab)")
  })

  it("omits video figures, the ad set and the link when absent", () => {
    const html = renderToStaticMarkup(<CreativePreviewBody creative={row({ creativeKey: "img", impressions: 5000 })} />)
    expect(html).not.toContain("Video views")
    expect(html).not.toContain("Ad set")
    expect(html).not.toContain("<a ")
    expect(html).toContain('data-creative-preview="none"')
  })
})

describe("opening a creative", () => {
  it("opens the preview sheet from a line row and closes with Escape", async () => {
    const host = await mount(
      <LineCreativePanelView rows={[row({ creativeKey: "fairway", name: "Fairway", impressions: 12000 })]} />,
    )
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Fairway")
    expect(button?.getAttribute("aria-haspopup")).toBe("dialog")
    await act(async () => {
      button?.click()
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.querySelector('[data-creative-panel="fairway"]')).not.toBeNull()
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(document.querySelector('[data-creative-panel="fairway"]')).toBeNull()
  })
})

describe("EntityBreakdownTable creatives by ad set", () => {
  const adSets = [
    { id: "238001", name: "Avid Golfers", spend: 100.05, impressions: 12000, clicks: 130 },
    { id: "238002", name: "Lapsed members", spend: 50, impressions: 5000, clicks: 50 },
  ]
  const creatives = [
    row({ creativeKey: "small", name: "Small", impressions: 2000, clicks: 30, spend: 20.02, adSetId: "238001" }),
    row({ creativeKey: "big", name: "Big", impressions: 9000, clicks: 90, spend: 70.01, adSetId: "238001" }),
    row({ creativeKey: "named", name: "Named", impressions: 5000, clicks: 50, spend: 50, adSetName: "Lapsed members" }),
  ]

  it("expands an ad set to its creatives by spend, with the unattributed gap", async () => {
    const host = await mount(
      <EntityBreakdownTable
        rows={adSets}
        knownPlanLineIds={[]}
        entityNoun={{ singular: "ad set", plural: "ad sets" }}
        columns="spend"
        defaultOpen
        creatives={creatives}
      />,
    )
    expect(host.querySelector("[data-ad-set-creative]")).toBeNull()
    const toggle = host.querySelector<HTMLButtonElement>('[data-ad-set-row="238001"] button')
    expect(toggle?.getAttribute("aria-expanded")).toBe("false")
    expect(toggle?.textContent).toContain("show 2 creatives")
    await act(async () => {
      toggle?.click()
    })
    expect(toggle?.getAttribute("aria-expanded")).toBe("true")
    const childRows = Array.from(host.querySelectorAll<HTMLElement>("[data-ad-set-creative]"))
    expect(childRows.map((r) => r.dataset.adSetCreative)).toEqual(["big", "small"])
    for (const id of toggle!.getAttribute("aria-controls")!.split(" ")) {
      expect(document.getElementById(id)).not.toBeNull()
    }
    expect(childRows[0]?.textContent).toContain("$70.01")
    const other = host.querySelector('[data-ad-set-unattributed="true"]')
    expect(other?.textContent).toContain("Other or unattributed")
    expect(other?.textContent).toContain("$10.02")
    expect(other?.textContent).toContain("1,000")
    expect(other?.textContent).toContain("10")

    const named = host.querySelector<HTMLButtonElement>('[data-ad-set-row="238002"] button')
    await act(async () => {
      named?.click()
    })
    expect(host.querySelector('[data-ad-set-creative="named"]')).not.toBeNull()
    expect(host.querySelectorAll('[data-ad-set-unattributed="true"]').length).toBe(1)
  })

  it("is a plain table without creatives", () => {
    const html = renderToStaticMarkup(
      <EntityBreakdownTable
        rows={adSets}
        knownPlanLineIds={[]}
        entityNoun={{ singular: "ad set", plural: "ad sets" }}
        columns="spend"
        defaultOpen
      />,
    )
    expect(html).not.toContain("aria-expanded=\"false\"")
    expect(html).not.toContain("data-ad-set-creative")
  })
})
