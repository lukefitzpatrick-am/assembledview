/**
 * Adapter coverage for useMediaPlanDirtyController (P2-2 React wrapper).
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useMediaPlanDirtyController } from "@/lib/mediaplan/useMediaPlanDirtyController"

type HookResult = ReturnType<typeof useMediaPlanDirtyController>

function Probe(props: { onResult: (result: HookResult) => void }) {
  const result = useMediaPlanDirtyController()
  props.onResult(result)
  return <span data-dirty={String(result.hasUnsavedChanges)} />
}

describe("useMediaPlanDirtyController", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: HookResult | null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    latest = null
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("starts clean with gate closed; markUnsavedChanges is a no-op until openGate", () => {
    act(() => {
      root.render(
        <Probe
          onResult={(r) => {
            latest = r
          }}
        />
      )
    })
    expect(latest).not.toBeNull()
    expect(latest!.hasUnsavedChanges).toBe(false)
    expect(latest!.isGateOpen()).toBe(false)

    act(() => {
      latest!.markUnsavedChanges()
    })
    expect(latest!.hasUnsavedChanges).toBe(false)

    act(() => {
      latest!.openGate()
      latest!.markUnsavedChanges()
    })
    expect(latest!.hasUnsavedChanges).toBe(true)
  })

  it("clearDirtyOnSaveSuccess clears; forceDirty bypasses gate", () => {
    act(() => {
      root.render(
        <Probe
          onResult={(r) => {
            latest = r
          }}
        />
      )
    })

    act(() => {
      latest!.forceDirty()
    })
    expect(latest!.hasUnsavedChanges).toBe(true)

    act(() => {
      latest!.clearDirtyOnSaveSuccess()
    })
    expect(latest!.hasUnsavedChanges).toBe(false)
  })
})
