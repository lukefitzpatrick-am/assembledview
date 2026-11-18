/**
 * B57: campaign detail and the scenario planner are the shared Dialog. Each is
 * labelled, keeps Tab inside, closes on Escape (only the top one when the
 * planner is open over the detail) and on its X, ignores a stray click
 * outside, and puts focus back on the control that opened it. They were
 * hand-built panels: a window Escape listener closed both at once, and focus
 * neither stayed in nor came back.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CampaignPacingCard } from "@/components/pacing/portfolio/CampaignPacingCard"
import { CampaignDetailProvider } from "@/components/pacing/detail/CampaignDetailContext"
import { ScenarioPlannerProvider } from "@/components/pacing/scenario/ScenarioPlannerContext"
import { PacingFilterProvider } from "@/lib/pacing/usePacingFilterStore"
import { lineCardFromSearch } from "@/lib/pacing/channel/lineCardModel"
import { searchFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import { assembleCampaignDetailPayload } from "@/lib/pacing/detail/assembleCampaignDetailPayload"
import { p6FixtureRows, P6_AS_OF } from "@/lib/pacing/portfolio/__tests__/p6Fixture"

function fixturePayload() {
  const row = p6FixtureRows().find((item) => item.mbaNumber === "BICAU002")!
  const line = lineCardFromSearch(searchFixture({ mbaNumber: row.mbaNumber, campaignName: row.campaignName }), P6_AS_OF)
  return assembleCampaignDetailPayload({
    row,
    lines: [{ ...line, cpm: null, views: null, buyType: null, fixedCost: false }],
    asOf: P6_AS_OF,
  })
}

const payload = fixturePayload()
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).startsWith("/api/pacing/scenarios") ? { scenarios: [] } : payload),
    })),
  )
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  window.history.replaceState({}, "", "/pacing/portfolio")
})

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(match: (text: string) => boolean, scope: ParentNode = document.body): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((el) => match(el.textContent?.trim() ?? ""))
  expect(found).toBeTruthy()
  return found as HTMLButtonElement
}

const dialogs = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]

function titleOf(el: HTMLElement) {
  return document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? ""
}

function pressEscape() {
  act(() => {
    ;(document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    )
  })
}

async function openDetail() {
  act(() => {
    root.render(
      <PacingFilterProvider initialAssignedClientIds={[]}>
        <ScenarioPlannerProvider>
          <CampaignDetailProvider>
            <CampaignPacingCard row={payload.row} asOf={P6_AS_OF} />
            <button type="button">Outside</button>
          </CampaignDetailProvider>
        </ScenarioPlannerProvider>
      </PacingFilterProvider>,
    )
  })
  const opener = button((t) => t.includes("Open campaign"))
  opener.focus()
  act(() => opener.click())
  await settle()
  return opener
}

describe("campaign detail window (B57)", () => {
  it("is labelled by the campaign, keeps Tab inside and returns focus on Escape", async () => {
    const opener = await openDetail()
    const [detail] = dialogs()
    expect(titleOf(detail!)).toContain(payload.row.campaignName)
    expect(titleOf(detail!)).toContain("BICAU002")
    expect(detail!.contains(document.activeElement)).toBe(true)
    act(() => button((t) => t === "Outside").focus())
    expect(detail!.contains(document.activeElement)).toBe(true)

    pressEscape()
    await settle()
    expect(dialogs()).toHaveLength(0)
    expect(window.location.search).not.toContain("campaign=")
    expect(document.activeElement).toBe(opener)
  })

  it("the X closes it and focus returns", async () => {
    const opener = await openDetail()
    const close = [...dialogs()[0]!.querySelectorAll("button")].filter((el) => el.textContent === "Close")
    expect(close).toHaveLength(1)
    act(() => close[0]!.click())
    await settle()
    expect(dialogs()).toHaveLength(0)
    expect(document.activeElement).toBe(opener)
  })

  it("a click outside does not close it", async () => {
    await openDetail()
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    })
    await settle()
    expect(dialogs()).toHaveLength(1)
  })

  it("the planner opens over it; Escape closes only the planner, then focus returns to Plan a scenario", async () => {
    await openDetail()
    // The card behind has its own Plan a scenario: use the one in the window header.
    const plan = button((t) => t === "Plan a scenario", dialogs()[0])
    plan.focus()
    act(() => plan.click())
    await settle()
    const open = dialogs()
    expect(open).toHaveLength(2)
    const planner = open.find((el) => titleOf(el) === "Scenario planner")
    expect(planner).toBeTruthy()
    expect(planner!.className).toContain("z-nested")
    expect(planner!.contains(document.activeElement)).toBe(true)

    pressEscape()
    await settle()
    expect(dialogs()).toHaveLength(1)
    expect(titleOf(dialogs()[0]!)).toContain(payload.row.campaignName)
    expect(document.activeElement).toBe(plan)
  })
})
