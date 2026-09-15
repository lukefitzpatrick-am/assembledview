/**
 * Drafts leave dialog: Stay / Leave only — no publish.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UnsavedChangesDialog } from "@/components/mediaplans/UnsavedChangesDialog"

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
})
