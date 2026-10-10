/** @vitest-environment jsdom */
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { PageHeader, withFullStop } from "@/components/layout/PageHeader"
import {
  billingMonthAccent,
  editCampaignLede,
  greetingFirstName,
  melbourneDayPart,
} from "@/components/layout/pageTitleCopy"

describe("PageHeader", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    host?.remove()
    root = null
    host = null
  })

  function render(node: ReactNode) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root?.render(node)
    })
    return host
  }

  it("puts the full stop on a plain title", () => {
    expect(withFullStop("Campaigns")).toBe("Campaigns.")
    expect(withFullStop("Campaigns.")).toBe("Campaigns.")
    const hostNode = render(<PageHeader title="Campaigns" lede="Every media plan, newest first." />)
    expect(hostNode.querySelector("h1")?.textContent).toBe("Campaigns.")
    expect(hostNode.textContent).toContain("Every media plan, newest first.")
  })

  it("puts the full stop on the serif accent and leaves the title as given", () => {
    const hostNode = render(
      <PageHeader title="Clients billing," accent="October" lede="All figures ex GST." />,
    )
    const heading = hostNode.querySelector("h1")
    const accent = heading?.querySelector("span")
    expect(heading?.textContent).toBe("Clients billing, October.")
    expect(accent?.textContent).toBe("October.")
    expect(accent?.className).toContain("font-serif")
    expect(accent?.className).toContain("italic")
  })
})

describe("page title copy", () => {
  it("greets by Melbourne hour and first name", () => {
    expect(melbourneDayPart(new Date("2026-10-10T00:30:00Z"))).toBe("morning")
    expect(melbourneDayPart(new Date("2026-10-10T02:00:00Z"))).toBe("afternoon")
    expect(melbourneDayPart(new Date("2026-10-10T08:00:00Z"))).toBe("evening")
    expect(greetingFirstName({ given_name: "Luke", name: "Luke Fitzpatrick" })).toBe("Luke")
    expect(greetingFirstName({ name: "luke.fitzpatrick@assembledmedia.com.au", email: "luke.fitzpatrick@assembledmedia.com.au" })).toBe("Luke")
  })

  it("names the billing month and the edit lede", () => {
    expect(billingMonthAccent("2026-10", "2026-10")).toBe("October")
    expect(billingMonthAccent("2026-10", "2026-12")).toBe("October to December")
    expect(
      editCampaignLede({ clientName: "Krusty Krab", mba: "KKAU004", publishedVersion: 3 }),
    ).toBe("Krusty Krab, MBA KKAU004, version 3 published. Changes save as an unpublished draft.")
    expect(editCampaignLede({ clientName: "Krusty Krab", mba: "KKAU004", publishedVersion: null })).toBe(
      "Krusty Krab, MBA KKAU004. Not published yet. Changes save as an unpublished draft.",
    )
  })
})
