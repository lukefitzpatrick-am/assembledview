/**
 * CHARACTERISATION — ExpertApplyDirtyClearOnSave CURRENT edge behaviour.
 *
 * Pairs with lib/mediaplan/__tests__/hasUnsavedChanges.characterisation.test.ts.
 * Do not "fix" to a desired future; the Save-gating commit must keep this green
 * or update it deliberately.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ExpertApplyDirtyClearOnSave } from "@/components/mediaplans/ExpertApplyDirtyClearOnSave"
import * as bridge from "@/lib/mediaplan/expertApplyDirtyBridge"

describe("CHARACTERISATION ExpertApplyDirtyClearOnSave", () => {
  let container: HTMLDivElement
  let root: Root
  let signalSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    signalSpy = vi.spyOn(bridge, "signalMediaPlanPageSaved")
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    signalSpy.mockRestore()
  })

  it("clean on mount (hasUnsavedChanges=false) does not signal", () => {
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={false} />)
    })
    expect(signalSpy).not.toHaveBeenCalled()
  })

  it("dirty on mount (hasUnsavedChanges=true) does not signal", () => {
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={true} />)
    })
    expect(signalSpy).not.toHaveBeenCalled()
  })

  it("false → true (field edit / Apply dirtying the page) does not signal", () => {
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={false} />)
    })
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={true} />)
    })
    expect(signalSpy).not.toHaveBeenCalled()
  })

  it("true → false (successful save clearing page dirty) signals once", () => {
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={true} />)
    })
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={false} />)
    })
    expect(signalSpy).toHaveBeenCalledTimes(1)
  })

  it("true → false → false does not re-signal (idempotent clear)", () => {
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={true} />)
    })
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={false} />)
    })
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={false} />)
    })
    expect(signalSpy).toHaveBeenCalledTimes(1)
  })

  it("CHARACTERISATION hazard: false clear after failed-save IF page wrongly flips dirty→clean would wipe Expert badges", () => {
    // Documents the coupling: Expert badges clear whenever hasUnsavedChanges
    // falls true→false — including a hypothetical buggy failed-save path.
    // Today's handleSaveAll catch does NOT flip clean (pinned in sibling test).
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={true} />)
    })
    // Simulate "failed save incorrectly cleared dirty" — CURRENT bridge would fire:
    act(() => {
      root.render(<ExpertApplyDirtyClearOnSave hasUnsavedChanges={false} />)
    })
    expect(signalSpy).toHaveBeenCalledTimes(1)
  })
})
