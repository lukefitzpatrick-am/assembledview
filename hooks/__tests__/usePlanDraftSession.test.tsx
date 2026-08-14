/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePlanDraftSession } from "@/hooks/usePlanDraftSession"
import * as localStore from "@/lib/mediaplan/drafts/localStore"
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
    tipPublishedAt: null,
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

  it("keeps modeResolved stable and pill from describePlanSavePill without runaway renders when drafts are off", () => {
    mount(0)
    expect(latest?.enabled).toBe(false)
    // Pill always comes from describePlanSavePill (mode primary); autosave chrome stays off.
    expect(latest?.pill?.primary).toMatch(/Draft of v2|Working draft|Publish will create/i)

    const modeAfterMount = latest?.modeResolved
    const pillAfterMount = latest?.pill
    expect(modeAfterMount).toBeTruthy()

    // Force many parent re-renders with identical hook inputs. Before the fix,
    // modeResolved was a fresh object every render → pill effect re-fired every
    // time and could cascade into max-update-depth.
    for (let i = 1; i <= 25; i++) {
      mount(i)
    }

    expect(latest?.enabled).toBe(false)
    // One result callback per committed render — not an exploding cascade.
    expect(renderPasses).toBeLessThanOrEqual(30)
    // Identity of modeResolved must be stable when inputs are unchanged.
    expect(latest?.modeResolved).toBe(modeAfterMount)
    expect(latest?.pill?.primary).toBe(pillAfterMount?.primary)
  })
})

const GLENDA_DRAFT: PlanDraftStateV1 = {
  v: 1,
  mbaNumber: "glenda006",
  masterId: 1,
  baseVersionId: 4347,
  formValues: { mp_campaignbudget: 20000 },
  channels: {
    search: [
      {
        line_item_id: "glenda006-se1",
        bursts: [{ budget: "$20,000.00", startDate: "2026-07-01", endDate: "2026-07-31" }],
      },
    ],
    television: [],
  },
  meta: { lineCount: 1, budgetCents: 2_000_000, tipLineIds: ["glenda006-se1"], tipBudgetCents: 2_500_000 },
}

function ResumeProbe(props: {
  hydrationSettled: boolean
  onResult: (result: HookResult) => void
  onRestore: (state: PlanDraftStateV1) => void
}) {
  const result = usePlanDraftSession({
    masterId: 1,
    mbaNumber: "glenda006",
    userId: "luke.fitzpatrick@assembledmedia.com.au",
    dirty: true,
    baseVersionId: 4347,
    campaignStatus: "Approved",
    publishedVersionNumber: 2,
    versionRowCount: 2,
    tipPublishedAt: "2026-01-01T00:00:00.000Z",
    hydrationSettled: props.hydrationSettled,
    getSnapshot: () => EMPTY_SNAPSHOT,
    onRestore: props.onRestore,
  })
  props.onResult(result)
  return null
}

describe("usePlanDraftSession resume restores full channel state", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: HookResult | null
  let restored: PlanDraftStateV1[]

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    latest = null
    restored = []
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    vi.spyOn(localStore, "readLocalDraft").mockResolvedValue(null)
    vi.spyOn(localStore, "clearLocalDraft").mockResolvedValue(undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/api/plans/drafts")) {
          return new Response(
            JSON.stringify({
              draft: {
                updatedAt: "2026-08-14T00:00:00.000Z",
                draftStateJson: GLENDA_DRAFT,
              },
              others: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        }
        return new Response("not found", { status: 404 })
      })
    )
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function renderProbe(hydrationSettled: boolean) {
    await act(async () => {
      root.render(
        <ResumeProbe
          hydrationSettled={hydrationSettled}
          onResult={(result) => {
            latest = result
          }}
          onRestore={(state) => {
            restored.push(state)
          }}
        />
      )
    })
  }

  async function waitForRecovery() {
    for (let i = 0; i < 30 && latest?.recovery == null; i++) {
      await act(async () => {
        await Promise.resolve()
      })
    }
  }

  it("round-trip: Resume after hydration settle applies the edited burst", async () => {
    await renderProbe(false)
    await waitForRecovery()
    expect(latest?.recovery).toBeTruthy()

    await act(async () => {
      latest?.resume()
    })
    expect(restored).toEqual([])
    expect(latest?.recovery).toBeNull()

    await renderProbe(true)
    expect(restored).toHaveLength(1)
    expect(
      (restored[0].channels.search[0] as { bursts: { budget: string }[] }).bursts[0]
        .budget
    ).toBe("$20,000.00")
  })

  it("deleted line: empty search array is in the restored state", async () => {
    const deleted: PlanDraftStateV1 = {
      ...GLENDA_DRAFT,
      channels: { search: [], television: [] },
      meta: { ...GLENDA_DRAFT.meta, lineCount: 0, budgetCents: 0 },
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes("/api/plans/drafts")) {
          return new Response(
            JSON.stringify({
              draft: { updatedAt: "2026-08-14T00:00:00.000Z", draftStateJson: deleted },
              others: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        }
        return new Response("not found", { status: 404 })
      })
    )
    await renderProbe(true)
    await waitForRecovery()
    await act(async () => {
      latest?.resume()
    })
    expect(restored[0]?.channels.search).toEqual([])
  })

  it("Discard clears the recovery offer without applying the draft", async () => {
    await renderProbe(true)
    await waitForRecovery()
    expect(latest?.recovery).toBeTruthy()
    await act(async () => {
      await latest?.discard()
    })
    expect(latest?.recovery).toBeNull()
    expect(restored).toEqual([])
  })
})

