/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePlanDraftSession } from "@/hooks/usePlanDraftSession"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"

const EMPTY_SNAPSHOT: PlanDraftStateV1 = {
  v: 1,
  mbaNumber: "TEST001",
  masterId: null,
  baseVersionId: null,
  formValues: {},
  channels: {},
  meta: { lineCount: 0, budgetCents: 0 },
}

type HookResult = ReturnType<typeof usePlanDraftSession>

function Probe(props: {
  nonce: number
  onResult: (result: HookResult, renderCount: number) => void
}) {
  const result = usePlanDraftSession({
    masterId: null,
    mbaNumber: "TEST001",
    dirty: false,
    baseVersionId: null,
    campaignStatus: "Draft",
    publishedVersionNumber: 2,
    versionRowCount: 2,
    getSnapshot: () => EMPTY_SNAPSHOT,
    onRestore: () => {},
  })
  // nonce is only to force parent re-renders without changing hook inputs
  props.onResult(result, props.nonce)
  return <span data-nonce={props.nonce} data-enabled={String(result.enabled)} />
}

describe("usePlanDraftSession disabled path (NEXT_PUBLIC_PLAN_DRAFTS off)", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: HookResult | null
  let renderPasses: number

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    vi.stubEnv("NEXT_PUBLIC_PLAN_DRAFTS", "off")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    latest = null
    renderPasses = 0
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllEnvs()
  })

  function mount(nonce: number) {
    act(() => {
      root.render(
        <Probe
          nonce={nonce}
          onResult={(result) => {
            latest = result
            renderPasses += 1
          }}
        />
      )
    })
  }

  it("keeps pill null across remounts without runaway renders when drafts are off", () => {
    mount(0)
    expect(latest?.enabled).toBe(false)
    expect(latest?.pill).toBeNull()

    const modeAfterMount = latest?.modeResolved
    expect(modeAfterMount).toBeTruthy()

    // Force many parent re-renders with identical hook inputs. Before the fix,
    // modeResolved was a fresh object every render → pill effect re-fired every
    // time. With setPill(null) on the disabled path that could cascade into
    // max-update-depth when combined with editor churn.
    for (let i = 1; i <= 25; i++) {
      mount(i)
    }

    expect(latest?.enabled).toBe(false)
    expect(latest?.pill).toBeNull()
    // One result callback per committed render — not an exploding cascade.
    expect(renderPasses).toBeLessThanOrEqual(30)
    // Identity of modeResolved must be stable when inputs are unchanged.
    expect(latest?.modeResolved).toBe(modeAfterMount)
  })
})
