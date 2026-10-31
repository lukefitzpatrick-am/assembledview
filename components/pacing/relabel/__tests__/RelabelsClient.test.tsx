/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setClientFeatureSnapshot } from "@/lib/features/client"
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

const DELIVERY = {
  windowDays: 30,
  rows: [
    {
      channel: "Social - Meta",
      platformEntityId: "120200001",
      name: "SA Awareness pgaaus015sm3",
      campaignName: "PGA Tour 2026/27",
      account: null,
      firstDate: "2026-10-02",
      lastDate: "2026-10-30",
      spend: 1940.99,
      impressions: 1000,
      currentLineItemId: null,
      suggestion: {
        kind: "relabel",
        mba: "pgaaus015",
        lineItemId: "pgaaus015sm3",
        action: "The ad set name carries pgaaus015sm3, a published line. Relabel it to that line.",
      },
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
        if (url.includes("/api/admin/unmapped-delivery")) {
          return { ok: true, json: async () => DELIVERY }
        }
        if (url.includes("/api/pacing/relabels/preview") && method === "POST") {
          return { ok: true, json: async () => BLOCKED_PREVIEW }
        }
        if (url.includes("/api/pacing/relabels") && method === "GET") {
          return { ok: true, json: async () => ({ relabels: [], drift: [] }) }
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
    setClientFeatureSnapshot(null)
  })

  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it("renders four tabs with Match open by default", async () => {
    act(() => {
      root.render(<RelabelsClient initial={{}} />)
    })
    await settle()
    const labels = [...container.querySelectorAll('[role="tab"]')].map((el) => el.textContent)
    expect(labels).toEqual(["Match", "New relabel", "Unmapped", "Log"])
    expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("Match")
    expect(container.textContent).toContain("Pick a client")
  })

  it("opens New relabel for older links that carry line and channel but no tab", async () => {
    act(() => {
      root.render(<RelabelsClient initial={{ mba: "BICAU002", line: "bicau002sm2", channel: "Social - Meta" }} />)
    })
    await settle()
    expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("New relabel")
  })

  it("Match lists a client's suggestions and Accept previews against the suggested line", async () => {
    const entity = {
      key: "Programmatic - Video|k1",
      channel: "Programmatic - Video",
      platformEntityId: "k1",
      name: "broad_men 55+ targeting-hartm001ML1",
      lineItemId: "hartm001ml1",
      campaignName: "Molicare",
      firstDate: "2026-01-25",
      lastDate: "2026-10-19",
      spend: 67264.62,
      impressions: 1000,
      mbaNumber: "hartm001",
      status: "not_on_plan",
      duplicateOf: null,
    }
    const payload = {
      client: { id: 12, name: "Paul Hartmann Pty Ltd" },
      since: "2025-04-20",
      campaigns: [{ mbaNumber: "hartm001", campaignName: "Molicare annual" }],
      entities: [entity],
      lines: [
        {
          lineItemId: "hartm001pv1",
          mbaNumber: "hartm001",
          lineChannel: "prog_video",
          platform: "DV360",
          buyType: "cpv",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          delivered: 0,
          entityCount: 0,
        },
      ],
      suggestions: [
        {
          id: "s1",
          kind: "high",
          entityKeys: [entity.key],
          targetLineIds: ["hartm001pv1"],
          reason: "Legacy ML code; the only programmatic video line is PV1.",
          spend: 67264.62,
        },
      ],
      summary: { unmatchedSpend: 67264.62, unmatchedCount: 1, linesWithoutDelivery: 1, suggestionCount: 1, checkDatesCount: 0 },
    }
    const calls: { url: string; body: unknown }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
        if (url.includes("/api/pacing/relabels/match")) {
          return { ok: true, json: async () => ({ clients: [{ id: 12, name: "Paul Hartmann Pty Ltd", campaignCount: 1 }], payload }) }
        }
        if (url.includes("/api/pacing/relabels/preview")) {
          return { ok: true, json: async () => BLOCKED_PREVIEW }
        }
        return { ok: true, json: async () => ({ relabels: [], drift: [] }) }
      }),
    )
    act(() => {
      root.render(<RelabelsClient initial={{ tab: "match", client: "12" }} />)
    })
    await settle()
    await settle()
    expect(calls.some((c) => c.url.includes("/api/pacing/relabels/match?client=12"))).toBe(true)
    expect(container.textContent).toContain("Legacy ML code")
    const accept = [...container.querySelectorAll("button")].find((el) => el.textContent === "Accept")
    expect(accept).toBeTruthy()
    await act(async () => {
      accept!.click()
      await Promise.resolve()
    })
    await settle()
    const preview = calls.find((c) => c.url.includes("/api/pacing/relabels/preview"))
    expect(preview?.body).toMatchObject({ channel: "Programmatic - Video", platformEntityId: "k1", lineItemId: "hartm001pv1" })
    // The stubbed preview is blocked, so Apply stays disabled and the request button shows.
    const apply = [...container.querySelectorAll("button")].find((el) => el.textContent === "Apply")
    expect(apply?.hasAttribute("disabled")).toBe(true)
    expect(container.textContent).toContain("Save blocked as requests for Luke")
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

  it("disables Apply when every in-scope row is already the target line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = (init?.method ?? "GET").toUpperCase()
        if (url.includes("/api/admin/unmapped-placements")) {
          return { ok: true, json: async () => UNMAPPED }
        }
        if (url.includes("/api/pacing/relabels/preview") && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              preview: {
                ...BLOCKED_PREVIEW.preview,
                channel: "Social - Meta",
                platformEntityId: "120256089860390550",
                entityName: "BICAU002 SM2",
                lineItemId: "bicau002sm2",
                cardChannel: "social",
                targetCardChannel: "social",
                moves: [
                  {
                    previousLineItemId: "bicau002sm2",
                    dateFrom: "2026-08-04",
                    dateTo: "2026-09-16",
                    dayCount: 44,
                    spend: 1200.5,
                    impressions: 100,
                    rows: 44,
                  },
                ],
                rowsMoving: 44,
                spendMoving: 1200.5,
                daysMoving: 44,
                blocks: [],
                state: "no_change",
                activeMap: {
                  channel: "Social - Meta",
                  platformLineItemId: "120256089860390550",
                  lineItemId: "bicau002sm2",
                  lineItemName: "SM2",
                  mbaNumber: "bicau002",
                  notes: null,
                },
              },
            }),
          }
        }
        if (url.includes("/api/pacing/relabels") && method === "GET") {
          return { ok: true, json: async () => ({ relabels: [], drift: [] }) }
        }
        return { ok: true, json: async () => ({}) }
      }),
    )
    act(() => {
      root.render(
        <RelabelsClient
          initial={{
            tab: "new",
            channel: "Social - Meta",
            entity: "120256089860390550",
            line: "bicau002sm2",
          }}
        />,
      )
    })
    await settle()
    const reason = container.querySelector("#relabel-reason") as HTMLTextAreaElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(reason, "already on the line")
      reason.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await settle()
    const previewBtn = [...container.querySelectorAll("button")].find((el) => el.textContent === "Preview")
    await act(async () => {
      previewBtn?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()
    expect(container.textContent).toContain(
      "Already attributed to bicau002sm2 for this scope. Nothing to write.",
    )
    expect(container.textContent).toContain("Existing map row kept")
    expect(container.textContent).not.toContain("Map row will be created")
    expect(container.textContent).toContain("$1,200.50")
    const apply = [...container.querySelectorAll("button")].find((el) => el.textContent === "Apply")
    const save = [...container.querySelectorAll("button")].find(
      (el) => el.textContent === "Save as request for Luke instead",
    )
    expect(apply?.hasAttribute("disabled")).toBe(true)
    expect(save?.hasAttribute("disabled")).toBe(false)
  })

  it("pre-fills New relabel from an Unmapped row action (CM360 table, switch off)", async () => {
    setClientFeatureSnapshot({ unmapped_delivery: false })
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

  it("Unmapped shows every channel with what to do, and Relabel pre-fills the suggested line (switch on)", async () => {
    setClientFeatureSnapshot({ unmapped_delivery: true })
    act(() => {
      root.render(<RelabelsClient initial={{ tab: "unmapped" }} />)
    })
    await settle()
    expect(container.querySelector("[data-unmapped-delivery]")).toBeTruthy()
    expect(container.textContent).toContain("Social - Meta: 1")
    expect(container.textContent).toContain("Relabel it to that line.")
    const relabel = [...container.querySelectorAll("button")].find((el) => el.textContent === "Relabel")
    act(() => {
      relabel!.click()
    })
    await settle()
    expect((container.querySelector("#relabel-entity") as HTMLInputElement)?.value).toBe("120200001")
    expect((container.querySelector("#relabel-channel") as HTMLSelectElement)?.value).toBe("Social - Meta")
    expect((container.querySelector("#relabel-mba") as HTMLInputElement)?.value).toBe("pgaaus015")
    expect((container.querySelector("#relabel-line") as HTMLInputElement)?.value).toBe("pgaaus015sm3")
    expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("New relabel")
  })

  it("shows a Log banner when drift is greater than 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes("/api/admin/unmapped-placements")) {
          return { ok: true, json: async () => UNMAPPED }
        }
        if (url.includes("/api/pacing/relabels")) {
          return {
            ok: true,
            json: async () => ({
              relabels: [],
              drift: [
                {
                  kind: "drift",
                  code: "drift",
                  message: "drift: relabel #12 Social - Meta / 999 → bicau002sm3 but map row is missing",
                },
              ],
            }),
          }
        }
        return { ok: true, json: async () => ({}) }
      }),
    )
    act(() => {
      root.render(<RelabelsClient initial={{ tab: "log" }} />)
    })
    await settle()
    await settle()
    const banner = container.querySelector("[data-relabel-drift-banner]")
    expect(banner).toBeTruthy()
    expect(banner?.textContent).toMatch(/1 map row drifted/)
  })
})
