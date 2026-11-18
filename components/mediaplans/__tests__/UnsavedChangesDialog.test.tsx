/**
 * Drafts leave dialog: Stay / Leave only — no publish.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UnsavedChangesDialog } from "@/components/mediaplans/UnsavedChangesDialog"
import { END_BEFORE_START_MESSAGE } from "@/lib/mediaplan/dateOrder"

describe("UnsavedChangesDialog drafts-on", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
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

  it("has Stay and Leave and no publish button", () => {
    const onStay = vi.fn()
    const onSave = vi.fn()
    const onLeave = vi.fn()
    act(() => {
      root.render(
        <UnsavedChangesDialog
          open
          onStay={onStay}
          onSave={onSave}
          onLeave={onLeave}
          isSaving={false}
          draftSaved
          tipVersionLabel="v4"
        />,
      )
    })
    const text = document.body.textContent ?? ""
    expect(text).toContain("Leave this plan?")
    expect(text).toContain("Clients still see v4.")
    expect(text).toContain("Stay")
    expect(text).toContain("Leave")
    expect(text).not.toContain("Publish and leave")
    expect(text).not.toContain("Save campaign")
  })

  const publishAndLeave = () =>
    [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Publish and leave")!

  it("B58fix R2: Publish and leave is disabled with its reason shown and linked, and does not save", () => {
    const onStay = vi.fn()
    const onSave = vi.fn()
    act(() => {
      root.render(
        <UnsavedChangesDialog
          open
          onStay={onStay}
          onSave={onSave}
          onLeave={vi.fn()}
          isSaving={false}
          saveDisabled
          saveDisabledReason={END_BEFORE_START_MESSAGE}
        />,
      )
    })
    const button = publishAndLeave()
    expect(button.disabled).toBe(true)
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "")
    expect(reason?.textContent).toBe(END_BEFORE_START_MESSAGE)
    act(() => button.click())
    expect(onStay).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("B58fix R2: with nothing blocking, Publish and leave saves and shows no reason", () => {
    const onSave = vi.fn()
    act(() => {
      root.render(
        <UnsavedChangesDialog open onStay={vi.fn()} onSave={onSave} onLeave={vi.fn()} isSaving={false} />,
      )
    })
    const button = publishAndLeave()
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute("aria-describedby")).toBe(false)
    expect(document.body.textContent).not.toContain(END_BEFORE_START_MESSAGE)
    act(() => button.click())
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
