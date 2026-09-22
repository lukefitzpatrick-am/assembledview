/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RelabelsClient } from "../RelabelsClient"

const UNMAPPED = {
  placements: [
    {
      placementName: "BICAU002_Twitch_ROS",
      campaignName: "bic-always-on",
      firstDate: "2026-08-26",
      lastDate: "2026-09-02",
      impressions: 12000,
      suggestedMba: "BICAU",
    },
  ],
}

const BLOCKED_PREVIEW = {
  preview: {
    channel: "Ad Serving - CM360",
    platformEntityId: "BICAU002_Twitch_ROS",
    entityName: "BICAU002_Twitch_ROS",
    lineItemId: "bicau002dv1",
    mbaNumber: "bicau002",
    dateFrom: null,
    dateTo: null,
    cardChannel: "ad-serving",
    targetCardChannel: "social",
    moves: [
      {
        previousLineItemId: null,
        dateFrom: "2026-08-26",
        dateTo: "2026-09-02",
        dayCount: 8,
        spend: 0,
        impressions: 12000,
        rows: 8,
      },
    ],
    rowsMoving: 8,
    spendMoving: 0,
    daysMoving: 8,
    warnings: [],
    blocks: [{ code: "channel_mismatch", message: "Entity channel does not match the plan line." }],
    duplicateOldNameDays: [],
    activeMap: null,
    publishedLine: {
      lineItemId: "bicau002dv1",
      mbaNumber: "bicau002",
      lineChannel: "digi_video",
      cardChannel: "ad-serving",
      published: true,
      onPublishedVersion: true,
    },
  },
}

describe("RelabelsClient", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = (init?.method ?? "GET").toUpperCase()
        if (url.includes("/api/admin/unmapped-placements")) {
          return { ok: true, json: async () => UNMAPPED }
        }
        if (url.includes("/api/pacing/relabels/preview") && method === "POST") {
          return { ok: true, json: async () => BLOCKED_PREVIEW }
        }
        if (url.includes("/api/pacing/relabels") && method === "GET") {
          return { ok: true, json: async () => ({ relabels: [] }) }
        }
        return { ok: true, json: async () => ({}) }
      }),
    )
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it("renders three tabs", async () => {
    act(() => {
      root.render(<RelabelsClient initial={{}} />)
    })
    await settle()
    const labels = [...container.querySelectorAll('[role="tab"]')].map((el) => el.textContent)
    expect(labels).toEqual(["New relabel", "Unmapped", "Log"])
  })

  it("disables Apply when the preview has blocks", async () => {
    act(() => {
      root.render(
        <RelabelsClient
          initial={{
            tab: "new",
            channel: "Ad Serving - CM360",
            entity: "BICAU002_Twitch_ROS",
            line: "bicau002dv1",
            mba: "BICAU002",
          }}
        />,
      )
    })
    await settle()
    const previewBtn = [...container.querySelectorAll("button")].find((el) => el.textContent === "Preview")
    await act(async () => {
      previewBtn?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()
    const apply = [...container.querySelectorAll("button")].find((el) => el.textContent === "Apply")
    expect(apply).toBeTruthy()
    expect(apply?.hasAttribute("disabled")).toBe(true)
  })

  it("pre-fills New relabel from an Unmapped row action", async () => {
    act(() => {
      root.render(<RelabelsClient initial={{ tab: "unmapped" }} />)
    })
    await settle()
    const relabel = [...container.querySelectorAll("button")].find((el) => el.textContent === "Relabel")
    expect(relabel).toBeTruthy()
    act(() => {
      relabel!.click()
    })
    await settle()
    const entity = container.querySelector("#relabel-entity") as HTMLInputElement
    const channel = container.querySelector("#relabel-channel") as HTMLSelectElement
    const mba = container.querySelector("#relabel-mba") as HTMLInputElement
    expect(entity?.value).toBe("BICAU002_Twitch_ROS")
    expect(channel?.value).toBe("Ad Serving - CM360")
    expect(mba?.value).toBe("BICAU")
    expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("New relabel")
  })
})
