/**
 * SF-1 — split Save/Publish + caret menu on the plan wizard bar.
 * SM-25 — menuOnly is a single trigger; menus can lock to side=bottom.
 *
 * @vitest-environment jsdom
 */
import { act, createElement, forwardRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type CapturedDropdownContent = {
  avoidCollisions?: boolean
  side?: string
  collisionPadding?: number
}

const capturedContent = vi.hoisted((): CapturedDropdownContent[] => [])

vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dropdown-menu")>()
  const Content = actual.DropdownMenuContent
  return {
    ...actual,
    DropdownMenuContent: forwardRef<HTMLDivElement, Record<string, unknown>>(
      (props, ref) => {
        capturedContent.push({
          avoidCollisions: props.avoidCollisions as boolean | undefined,
          side: props.side as string | undefined,
          collisionPadding: props.collisionPadding as number | undefined,
        })
        return createElement(Content, { ...props, ref } as never)
      },
    ),
  }
})

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
    capturedContent.length = 0
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

  it("hideCaret omits the menu caret", () => {
    act(() => {
      root.render(
        <SplitActionButton
          label="Open"
          hideCaret
          onPrimary={() => {}}
          menu={[{ label: "Edit media plan · v6", onSelect: () => {} }]}
        />
      )
    })
    const buttons = [...container.querySelectorAll("button")]
    expect(buttons.length).toBe(1)
    expect(buttons[0]?.getAttribute("aria-haspopup")).not.toBe("menu")
  })

  it("menuOnly opens the menu from the primary label", async () => {
    act(() => {
      root.render(
        <SplitActionButton
          label="Download"
          menuOnly
          menu={[{ label: "MBA (PDF)", onSelect: () => {} }]}
        />
      )
    })
    const primary = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Download")
    )
    await act(async () => {
      primary!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      primary!.click()
    })
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
    expect(document.body.textContent).toContain("MBA (PDF)")
  })

  it("menuOnly renders one menu trigger and no caret", () => {
    act(() => {
      root.render(
        <SplitActionButton
          label="Open"
          menuOnly
          menu={[{ label: "View campaign", onSelect: () => {} }]}
        />,
      )
    })
    const buttons = [...container.querySelectorAll("button")]
    expect(buttons.length).toBe(1)
    const trigger = buttons[0]
    expect(
      trigger?.getAttribute("aria-haspopup") === "menu" ||
        trigger?.getAttribute("role") === "combobox",
    ).toBe(true)
    expect(
      [...container.querySelectorAll("button")].find(
        (el) => el.getAttribute("aria-label") === "Open menu",
      ),
    ).toBeUndefined()
  })

  it("size row applies h-9", () => {
    act(() => {
      root.render(
        <SplitActionButton
          label="Open"
          menuOnly
          size="row"
          menu={[{ label: "View campaign", onSelect: () => {} }]}
        />,
      )
    })
    expect(container.querySelector("button")?.className).toContain("h-9")
  })

  it("fullWidth puts w-full on the wrapper", () => {
    act(() => {
      root.render(
        <SplitActionButton
          label="Open"
          menuOnly
          fullWidth
          menu={[{ label: "View campaign", onSelect: () => {} }]}
        />,
      )
    })
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain("w-full")
  })

  it("menuSide bottom locks content below the trigger without collision flip", async () => {
    capturedContent.length = 0
    act(() => {
      root.render(
        <SplitActionButton
          label="Open"
          menuOnly
          menuSide="bottom"
          menu={[{ label: "View campaign", onSelect: () => {} }]}
        />,
      )
    })
    const trigger = container.querySelector("button")
    await act(async () => {
      trigger!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      trigger!.click()
    })
    const last = capturedContent.at(-1)
    expect(last?.side).toBe("bottom")
    expect(last?.avoidCollisions).toBe(false)
    const menu = document.body.querySelector("[role='menu']")
    expect(menu?.getAttribute("data-side")).toBe("bottom")
  })
})
