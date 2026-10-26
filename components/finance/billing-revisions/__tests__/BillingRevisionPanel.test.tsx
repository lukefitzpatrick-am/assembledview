/**
 * Change billing timing panel (billing revisions C7). Luke runs this with
 * vitest (it is in vitest.config.ts include).
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BillingRevisionPanel } from "@/components/finance/billing-revisions/BillingRevisionPanel"

const CONTEXT = {
  ok: true,
  mbaNumber: "PENFOLD020",
  baseVersionNumber: 29,
  currentMonth: "2026-10",
  campaignStartMonth: "2026-10",
  campaignEndMonth: "2027-01",
  months: [
    { month: "2026-10", level: "soft", reasons: ["approved"], past: false, mediaCents: 1_414_525 },
    { month: "2026-11", level: "open", reasons: [], past: false, mediaCents: 10_015_093 },
    { month: "2026-12", level: "open", reasons: [], past: false, mediaCents: 29_286_713 },
  ],
  approvedMonths: ["2026-10"],
  lines: [
    { lineItemId: "PENFOLD020DV1", label: "DV1", isProduction: false, clientPaysForMedia: false, media: { "2026-10": 363_636, "2026-11": 909_091 } },
  ],
  workingDraftCount: 2,
  partial: false,
  pacingHints: {},
}

function previewBody(newVersionNumber: number) {
  const m = (month: string, before: number, after: number, level = "open", reasons: string[] = []) => ({
    month,
    lock: { month, level, reasons, past: false },
    effectiveLevel: level === "soft" ? "open" : level,
    media: { month, before, after },
    fee: { month, before: 0, after: 0 },
    adserving: { month, before: 0, after: 0 },
    production: { month, before: 0, after: 0 },
    total: { month, before, after },
  })
  return {
    ok: true,
    baseVersionNumber: 29,
    newVersionNumber,
    previewToken: `tok-${newVersionNumber}`,
    expiresAt: "2026-10-26T06:15:00Z",
    impacts: ["Oct 2026 is approved at $14,160.67. It will show \"changed since\" and need Re-approve.", `Publishes v${newVersionNumber} and a new MBA PDF (kept on file, no client re-sign).`],
    plan: {
      ok: true,
      movedCents: 10_000_000,
      credits: [],
      warnings: [],
      cannotUndo: [],
      afterCells: [],
      hash: "h",
      lines: [
        {
          lineItemId: "PENFOLD020DV1",
          label: "DV1",
          media: [
            { month: "2026-10", before: 363_636, after: 1_272_727 },
            { month: "2026-11", before: 909_091, after: 0 },
          ],
          fee: [],
          adserving: [],
        },
      ],
      months: [m("2026-10", 1_414_525, 11_414_525, "soft", ["approved"]), m("2026-11", 10_015_093, 15_093), {
        ...m("2026-12", 29_286_713, 29_286_713, "hard", ["sent_to_accounts"]),
        effectiveLevel: "hard",
      }],
    },
  }
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
}

describe("BillingRevisionPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(fetchImpl: typeof fetch) {
    await act(async () => {
      root.render(<BillingRevisionPanel open onOpenChange={() => {}} mbaNumber="PENFOLD020" fetchImpl={fetchImpl} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }

  function button(label: RegExp): HTMLButtonElement {
    const b = [...document.querySelectorAll("button")].find((x) => label.test(x.textContent ?? ""))
    if (!b) throw new Error(`no button ${label}`)
    return b as HTMLButtonElement
  }

  it("Preview stays disabled until there is an amount and a reason", async () => {
    const fetchImpl = vi.fn((url: string) => json(url.includes("/context") ? CONTEXT : {})) as unknown as typeof fetch
    await render(fetchImpl)
    expect(button(/^Preview$/).disabled).toBe(true)
    await act(async () => setValue(document.getElementById("br-amount") as HTMLInputElement, "100000"))
    expect(button(/^Preview$/).disabled).toBe(true)
    await act(async () => setValue(document.getElementById("br-reason") as HTMLTextAreaElement, "Client asked"))
    expect(button(/^Preview$/).disabled).toBe(false)
  })

  it("renders the preview grid with changed cells and a locked month, then refreshes a stale preview", async () => {
    let applyCalls = 0
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("/context")) return json(CONTEXT)
      if (url.includes("/preview")) return json(previewBody(30))
      applyCalls += 1
      return json({ ok: false, code: "PREVIEW_STALE", message: "changed", freshPreview: previewBody(31) }, 409)
    }) as unknown as typeof fetch
    await render(fetchImpl)
    await act(async () => setValue(document.getElementById("br-amount") as HTMLInputElement, "100000"))
    await act(async () => setValue(document.getElementById("br-reason") as HTMLTextAreaElement, "Client asked"))
    await act(async () => button(/^Preview$/).click())
    await act(async () => {
      await Promise.resolve()
    })
    const grid = document.querySelector("[data-revision-preview]")
    expect(grid).not.toBeNull()
    expect(grid!.querySelectorAll("td[data-changed]").length).toBeGreaterThan(0)
    expect(grid!.querySelector("th[data-locked]")?.textContent).toBe("Dec 2026")
    expect(button(/Publish billing revision v30/)).toBeTruthy()
    await act(async () => button(/Publish billing revision v30/).click())
    await act(async () => {
      await Promise.resolve()
    })
    expect(applyCalls).toBe(1)
    expect(button(/Publish billing revision v31/)).toBeTruthy()
  })
})
