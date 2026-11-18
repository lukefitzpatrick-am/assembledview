/**
 * B57: the three read-only draft windows (stale base, draft vs published
 * lines, draft vs tip fields) are the shared Dialog: a labelled title, Escape
 * and Close both close, Tab stays inside, and focus returns to the control
 * that opened them. They were hand-built panels with none of that.
 *
 * @vitest-environment jsdom
 */
import { act, useState, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  PlanDraftFieldDiffDialog,
  PlanDraftTipCompareDialog,
  PlanStaleBaseDialog,
} from "@/components/mediaplan/PlanDraftChrome"
import { EMPTY_DRAFT_DIFF_SUMMARY } from "@/lib/mediaplan/drafts/fieldDiff"

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

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((el) => el.textContent?.trim() === label)
  expect(found, label).toBeTruthy()
  return found as HTMLButtonElement
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

/** Mounted while shown, as both plan pages do (`{open ? <Window /> : null}`). */
function Page({ window }: { window: (close: () => void) => ReactNode }) {
  const [shown, setShown] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setShown(true)}>
        Compare
      </button>
      <button type="button">Elsewhere</button>
      {shown ? window(() => setShown(false)) : null}
    </>
  )
}

const WINDOWS: { name: string; title: string; window: (close: () => void) => ReactNode }[] = [
  {
    name: "PlanStaleBaseDialog",
    title: "Someone published this plan while you were editing",
    window: (close) => (
      <PlanStaleBaseDialog compare={{ sections: { base: "v3", yours: "draft", current: "v4" } }} onClose={close} />
    ),
  },
  {
    name: "PlanDraftTipCompareDialog",
    title: "Your draft vs the published plan",
    window: (close) => (
      <PlanDraftTipCompareDialog added={["a1"]} removed={[]} keptCount={2} budgetDeltaCents={250000} onClose={close} />
    ),
  },
  {
    name: "PlanDraftFieldDiffDialog",
    title: "Your draft vs v7",
    window: (close) => (
      <PlanDraftFieldDiffDialog summary={EMPTY_DRAFT_DIFF_SUMMARY} tipVersionNumber={7} onClose={close} />
    ),
  },
]

async function open(win: (typeof WINDOWS)[number]) {
  act(() => root.render(<Page window={win.window} />))
  const opener = button("Compare")
  opener.focus()
  act(() => opener.click())
  await settle()
  return opener
}

describe.each(WINDOWS)("$name (B57)", (win) => {
  it("is a dialog labelled by its title, and Tab stays inside", async () => {
    await open(win)
    const el = dialog()
    expect(el).toBeTruthy()
    const titleId = el!.getAttribute("aria-labelledby")
    expect(document.getElementById(titleId!)?.textContent?.trim()).toBe(win.title)
    expect(el!.contains(document.activeElement)).toBe(true)
    act(() => button("Elsewhere").focus())
    expect(el!.contains(document.activeElement)).toBe(true)
  })

  it("Escape closes it and focus returns to the opener", async () => {
    const opener = await open(win)
    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      )
    })
    await settle()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("its Close button closes it and focus returns to the opener", async () => {
    const opener = await open(win)
    const close = [...dialog()!.querySelectorAll("button")].find((el) => el.textContent === "Close")
    act(() => close!.click())
    await settle()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
