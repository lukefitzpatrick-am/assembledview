/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setClientFeatureSnapshot } from "@/lib/features/client"
import { RelabelsClient } from "../RelabelsClient"

const PREVIEW = {
  channel: "Social - Meta",
  platformEntityId: "120200001",
  entityName: "SA Awareness",
  lineItemId: "pgaaus015sm3",
  mbaNumber: "pgaaus015",
  dateFrom: null,
  dateTo: null,
  cardChannel: "social",
  targetCardChannel: "social",
  moves: [{ previousLineItemId: null, dateFrom: "2026-10-02", dateTo: "2026-10-30", dayCount: 29, spend: 100, impressions: 1000, rows: 29 }],
  rowsMoving: 29,
  spendMoving: 100,
  daysMoving: 29,
  warnings: [],
  blocks: [],
  state: "apply",
  duplicateOldNameDays: [],
  activeMap: null,
  publishedLine: null,
}

const OFFER = { campaignName: "PGA_AU_2026_Tour", clientId: 7, clientName: "PGA", refusal: null }

type Answer = { status?: number; body: unknown }

describe("RelabelsClient: Save as a client alias (S5b)", () => {
  let container: HTMLDivElement
  let root: Root
  let previewAnswer: unknown
  let applyAnswer: Answer
  let applyBodies: Record<string, unknown>[]

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    previewAnswer = { preview: PREVIEW, clientAlias: OFFER }
    applyAnswer = { body: { result: { relabelId: 1 }, preview: PREVIEW } }
    applyBodies = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes("/api/pacing/relabels/preview")) return { ok: true, status: 200, json: async () => previewAnswer }
        if (url.includes("/api/pacing/relabels/apply")) {
          applyBodies.push(JSON.parse(String(init?.body)))
          const status = applyAnswer.status ?? 200
          return { ok: status < 400, status, json: async () => applyAnswer.body }
        }
        return { ok: true, status: 200, json: async () => ({ placements: [], relabels: [], drift: [] }) }
      }),
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    setClientFeatureSnapshot(null)
  })

  async function settle() {
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve()
    })
  }

  const button = (text: string) => [...container.querySelectorAll("button")].find((el) => el.textContent === text)!

  async function openAndPreview() {
    act(() => {
      root.render(
        <RelabelsClient initial={{ tab: "new", channel: "Social - Meta", entity: "120200001", line: "pgaaus015sm3", mba: "pgaaus015" }} />,
      )
    })
    await settle()
    const reason = container.querySelector<HTMLTextAreaElement>("#relabel-reason")!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, "supplier code")
      reason.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      button("Preview").click()
    })
    await settle()
  }

  const tick = () => container.querySelector<HTMLInputElement>("#relabel-save-alias")

  it("offers a labelled tick with a help tip and sends saveClientAlias only when ticked", async () => {
    setClientFeatureSnapshot({ in_app_help: true })
    await openAndPreview()
    const box = tick()!
    expect(box).toBeTruthy()
    expect(box.disabled).toBe(false)
    expect(container.querySelector('label[for="relabel-save-alias"]')?.textContent).toBe(
      'Save as a client alias: "PGA_AU_2026_Tour" for PGA',
    )
    expect(container.querySelector('[aria-label="Help: Save as a client alias"]')).toBeTruthy()

    await act(async () => button("Apply").click())
    await settle()
    expect(applyBodies[0]).not.toHaveProperty("saveClientAlias")

    await openAndPreview()
    act(() => tick()!.click())
    await act(async () => button("Apply").click())
    await settle()
    expect(applyBodies[1]).toMatchObject({ saveClientAlias: true })
  })

  it("a refused name keeps the tick focusable but unusable, and says why on the field", async () => {
    previewAnswer = { preview: PREVIEW, clientAlias: { ...OFFER, refusal: '"Prospecting" has no digit or separator.' } }
    await openAndPreview()
    const box = tick()!
    expect(box.disabled).toBe(false)
    expect(box.getAttribute("aria-disabled")).toBe("true")
    act(() => box.click())
    expect(tick()!.checked).toBe(false)
    const reason = document.getElementById(box.getAttribute("aria-describedby")!)
    expect(reason?.textContent).toBe('"Prospecting" has no digit or separator.')
    await act(async () => button("Apply").click())
    await settle()
    expect(applyBodies[0]).not.toHaveProperty("saveClientAlias")
  })

  it("a second preview clears the tick, so an alias is never saved for the wrong entity", async () => {
    await openAndPreview()
    act(() => tick()!.click())
    expect(tick()!.checked).toBe(true)
    await act(async () => button("Preview").click())
    await settle()
    expect(tick()!.checked).toBe(false)
    await act(async () => button("Apply").click())
    await settle()
    expect(applyBodies[0]).not.toHaveProperty("saveClientAlias")
  })

  it("an apply refused for the alias puts the reason on the tick box", async () => {
    applyAnswer = { status: 400, body: { error: "alias_refused", field: "saveClientAlias", message: "Already another client's alias." } }
    await openAndPreview()
    act(() => tick()!.click())
    await act(async () => button("Apply").click())
    await settle()
    const box = tick()!
    expect(box.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(box)
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.textContent).toBe("Already another client's alias.")
  })

  it("no offer (switch off): no tick, and the apply body is as before", async () => {
    previewAnswer = { preview: PREVIEW }
    await openAndPreview()
    expect(tick()).toBeNull()
    await act(async () => button("Apply").click())
    await settle()
    expect(Object.keys(applyBodies[0]!).sort()).toEqual(
      ["acknowledgeWarnings", "channel", "dateFrom", "dateTo", "lineItemId", "platformEntityId", "reason", "saveAsRequest"],
    )
  })
})
