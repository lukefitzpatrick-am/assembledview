/**
 * SF-1 — split Save/Publish + caret menu on the plan wizard bar.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SplitActionButton } from "@/components/mediaplans/SplitActionButton"

function pointerCaptureShim() {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
  }
}

describe("SplitActionButton", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    pointerCaptureShim()
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

  it("caret opens on click, not hover; Escape closes and returns focus to the caret", async () => {
    const onPrimary = vi.fn()
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <SplitActionButton
          label="Publish"
          onPrimary={onPrimary}
          menu={[
            {
              label: "Publish and exit",
              hint: "Publishes, then returns to Campaigns",
              onSelect,
            },
          ]}
        />
      )
    })

    const buttons = [...container.querySelectorAll("button")]
    const caret = buttons.find((el) => el.getAttribute("aria-haspopup") === "menu")
    expect(caret).toBeTruthy()
    expect(caret?.getAttribute("aria-expanded")).toBe("false")

    await act(async () => {
      caret!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    })
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(caret?.getAttribute("aria-expanded")).toBe("false")

    await act(async () => {
      caret!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      caret!.click()
    })
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
    expect(caret?.getAttribute("aria-expanded")).toBe("true")
    expect(document.body.textContent).toContain("Publish and exit")

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(caret)
  })

  it("disabled disables both segments", () => {
    act(() => {
      root.render(
        <SplitActionButton
          label="Publish"
          disabled
          onPrimary={() => {}}
          menu={[{ label: "Publish and exit", onSelect: () => {} }]}
        />
      )
    })
    const buttons = [...container.querySelectorAll("button")]
    expect(buttons.length).toBe(2)
    for (const btn of buttons) {
      expect(btn.disabled).toBe(true)
    }
  })

  it("isBusy disables both segments", () => {
    act(() => {
      root.render(
        <SplitActionButton
          label="Publish"
          busyLabel="Publishing…"
          isBusy
          onPrimary={() => {}}
          menu={[{ label: "Publish and exit", onSelect: () => {} }]}
        />
      )
    })
    const buttons = [...container.querySelectorAll("button")]
    expect(buttons.length).toBe(2)
    for (const btn of buttons) {
      expect(btn.disabled).toBe(true)
    }
    expect(container.textContent).toContain("Publishing…")
  })

  it("selecting a menu item calls its onSelect once and closes the menu", async () => {
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <SplitActionButton
          label="Publish"
          onPrimary={() => {}}
          menu={[{ label: "Publish and exit", onSelect }]}
        />
      )
    })
    const caret = [...container.querySelectorAll("button")].find(
      (el) => el.getAttribute("aria-haspopup") === "menu"
    )
    await act(async () => {
      caret!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      caret!.click()
    })
    const item = [...document.body.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes("Publish and exit")
    )
    expect(item).toBeTruthy()
    await act(async () => {
      ;(item as HTMLElement).click()
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })
})
