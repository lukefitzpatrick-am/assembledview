/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { JAYCO_AS_OF, JAYCO_LINES } from "@/lib/pacing/scenario/__tests__/jaycoFixture"
import { ScenarioPlannerPanel } from "../ScenarioPlannerPanel"

describe("ScenarioPlannerPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function renderPanel(props: Partial<React.ComponentProps<typeof ScenarioPlannerPanel>> = {}) {
    act(() => {
      root.render(
        <ScenarioPlannerPanel
          mba="jayco001"
          campaignName="Jayco AU"
          versionNumber={14}
          asOf={JAYCO_AS_OF}
          lines={JAYCO_LINES}
          {...props}
        />,
      )
    })
  }

  it("renders the Jayco fixture lines and a starting result", () => {
    renderPanel()
    expect(container.textContent).toContain("Jayco AU")
    expect(container.textContent).toMatch(/185,904/)
    expect(container.textContent).toMatch(/42,211/)
    expect(container.textContent).toMatch(/What changes|Projected finish/i)
  })

  it("recalculates when a lever changes", () => {
    renderPanel()
    const before = container.textContent ?? ""
    const move = container.querySelector('input[name="move-amount"]') as HTMLInputElement | null
    expect(move).toBeTruthy()
    act(() => {
      move!.value = "8000"
      move!.dispatchEvent(new Event("input", { bubbles: true }))
      move!.dispatchEvent(new Event("change", { bubbles: true }))
    })
    const cap = container.querySelector('input[name="daily-cap"]') as HTMLInputElement | null
    if (cap) {
      act(() => {
        cap.value = "164"
        cap.dispatchEvent(new Event("input", { bubbles: true }))
        cap.dispatchEvent(new Event("change", { bubbles: true }))
      })
    }
    const after = container.textContent ?? ""
    expect(after).toMatch(/34,211|161,077|108/)
    expect(after).not.toBe(before)
  })

  it("Draft change note builds the payload", () => {
    const onDraftNote = vi.fn()
    renderPanel({ onDraftNote })
    const button = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Draft change note"),
    )
    expect(button).toBeTruthy()
    act(() => {
      button!.click()
    })
    expect(onDraftNote).toHaveBeenCalledTimes(1)
    const payload = onDraftNote.mock.calls[0][0]
    expect(payload.message).toMatch(/platform-ready change list/i)
    expect(payload.scenario.mba).toBe("jayco001")
  })

  it("Save writes and lists the scenario", async () => {
    const onSave = vi.fn().mockResolvedValue({
      id: 1,
      name: "Move 8k",
      createdAt: "2026-09-17T00:00:00.000Z",
    })
    renderPanel({
      onSave,
      saved: [],
    })
    const name = container.querySelector('input[name="scenario-name"]') as HTMLInputElement
    expect(name).toBeTruthy()
    act(() => {
      name.value = "Move 8k"
      name.dispatchEvent(new Event("input", { bubbles: true }))
      name.dispatchEvent(new Event("change", { bubbles: true }))
    })
    const button = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Save scenario"),
    )
    expect(button).toBeTruthy()
    await act(async () => {
      button!.click()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalled()
    expect(onSave.mock.calls[0][0].name).toBe("Move 8k")
  })
})
