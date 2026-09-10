/**
 * CE4b — week-cell context menu: close on scroll/resize; keyboard cycle.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ExpertGridWeekContextMenu } from "@/components/media-containers/ExpertGridWeekContextMenu"

function menuRoot() {
  return document.querySelector<HTMLElement>("[data-eg-week-context-menu]")
}

function menuItems() {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  )
}

function itemByLabel(label: string) {
  return menuItems().find((el) => el.textContent?.includes(label)) ?? null
}

function dispatchKey(key: string) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    )
  })
}

describe("ExpertGridWeekContextMenu CE4b", () => {
  let host: HTMLDivElement
  let root: Root
  let origin: HTMLInputElement
  let onClose: ReturnType<typeof vi.fn<() => void>>
  let onCut: ReturnType<typeof vi.fn<() => void>>
  let onCopy: ReturnType<typeof vi.fn<() => void>>
  let onPaste: ReturnType<typeof vi.fn<() => void>>
  let onDelete: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    host = document.createElement("div")
    document.body.appendChild(host)
    origin = document.createElement("input")
    origin.setAttribute("data-eg-origin-cell", "")
    document.body.appendChild(origin)
    origin.focus()
    onClose = vi.fn<() => void>()
    onCut = vi.fn<() => void>()
    onCopy = vi.fn<() => void>()
    onPaste = vi.fn<() => void>()
    onDelete = vi.fn<() => void>()
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    origin.remove()
  })

  function renderMenu(pasteDisabled = true) {
    act(() => {
      root.render(
        <ExpertGridWeekContextMenu
          x={40}
          y={40}
          pasteDisabled={pasteDisabled}
          returnFocusTo={origin}
          onCut={onCut}
          onCopy={onCopy}
          onPaste={onPaste}
          onDelete={onDelete}
          onClose={onClose}
        />,
      )
    })
  }

  it("scroll with the menu open closes it", () => {
    renderMenu()
    expect(menuRoot()).toBeTruthy()
    act(() => {
      window.dispatchEvent(new Event("scroll", { bubbles: false, cancelable: true }))
    })
    expect(onClose).toHaveBeenCalled()
  })

  it("resize closes it", () => {
    renderMenu()
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(onClose).toHaveBeenCalled()
  })

  it("open → focus lands on Cut", () => {
    renderMenu()
    const cut = itemByLabel("Cut")
    expect(cut).toBeTruthy()
    expect(document.activeElement).toBe(cut)
  })

  it("Down/Up cycle skips a disabled Paste", () => {
    renderMenu(true)
    expect(itemByLabel("Paste")?.disabled).toBe(true)
    expect(document.activeElement).toBe(itemByLabel("Cut"))

    dispatchKey("ArrowDown")
    expect(document.activeElement).toBe(itemByLabel("Copy"))

    dispatchKey("ArrowDown")
    expect(document.activeElement).toBe(itemByLabel("Delete"))
    expect(document.activeElement).not.toBe(itemByLabel("Paste"))

    dispatchKey("ArrowDown")
    expect(document.activeElement).toBe(itemByLabel("Cut"))

    dispatchKey("ArrowUp")
    expect(document.activeElement).toBe(itemByLabel("Delete"))
  })

  it("Escape closes and focus returns to the originating cell", () => {
    renderMenu()
    expect(document.activeElement).not.toBe(origin)
    dispatchKey("Escape")
    expect(onClose).toHaveBeenCalled()
    expect(document.activeElement).toBe(origin)
  })
})
