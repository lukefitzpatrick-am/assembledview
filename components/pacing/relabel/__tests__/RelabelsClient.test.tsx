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
