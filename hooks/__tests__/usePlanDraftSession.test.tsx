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
  baseVersionId?: number | null
  onResult: (result: HookResult) => void
  onRestore: (state: PlanDraftStateV1) => void
  onRevertToBase?: (state: PlanDraftStateV1) => void
}) {
  const result = usePlanDraftSession({
    masterId: 1,
    mbaNumber: "glenda006",
    userId: "luke.fitzpatrick@assembledmedia.com.au",
    dirty: true,
    baseVersionId: props.baseVersionId === undefined ? 4347 : props.baseVersionId,
    campaignStatus: "Approved",
    publishedVersionNumber: 2,
    versionRowCount: 2,
    tipPublishedAt: "2026-01-01T00:00:00.000Z",
    hydrationSettled: props.hydrationSettled,
    getSnapshot: () => EMPTY_SNAPSHOT,
    onRestore: props.onRestore,
    onRevertToBase: props.onRevertToBase,
  })
  props.onResult(result)
  return null
}

function CreateProbe(props: {
  onResult: (result: HookResult) => void
  onRestore: (state: PlanDraftStateV1) => void
}) {
  const result = usePlanDraftSession({
    masterId: null,
    mbaNumber: "TEST001",
    userId: "luke.fitzpatrick@assembledmedia.com.au",
    dirty: false,
    baseVersionId: null,
    campaignStatus: "Draft",
    publishedVersionNumber: 0,
    versionRowCount: 0,
    tipPublishedAt: null,
    hydrationSettled: true,
    getSnapshot: () => EMPTY_SNAPSHOT,
    onRestore: props.onRestore,
  })
  props.onResult(result)
  return null
}

describe("usePlanDraftSession auto-load + stale guard", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: HookResult | null
  let restored: PlanDraftStateV1[]
  let reverted: PlanDraftStateV1[]
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    latest = null
    restored = []
    reverted = []
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    vi.spyOn(localStore, "readLocalDraft").mockResolvedValue(null)
    vi.spyOn(localStore, "clearLocalDraft").mockResolvedValue(undefined)
    fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/plans/drafts") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            draft: {
              updatedAt: "2026-08-14T00:00:00.000Z",
              draftStateJson: GLENDA_DRAFT,
              baseVersionId: 4347,
            },
            others: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }
      if (url.includes("/api/plans/drafts") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function renderProbe(
    hydrationSettled: boolean,
    baseVersionId?: number | null,
  ) {
    await act(async () => {
      root.render(
        <ResumeProbe
          hydrationSettled={hydrationSettled}
          baseVersionId={baseVersionId}
          onResult={(result) => {
            latest = result
          }}
          onRestore={(state) => {
            restored.push(state)
          }}
          onRevertToBase={(state) => {
            reverted.push(state)
          }}
        />
      )
    })
  }

  async function renderCreateProbe() {
    await act(async () => {
      root.render(
        <CreateProbe
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

  async function waitUntil(pred: () => boolean) {
    for (let i = 0; i < 40 && !pred(); i++) {
      await act(async () => {
        await Promise.resolve()
      })
    }
  }

  it("auto-applies when base === tip after hydration, without a Resume click", async () => {
    await renderProbe(false)
    await waitUntil(() => latest != null)
    expect(restored).toEqual([])
    expect(latest?.recovery).toBeNull()

    await renderProbe(true)
    await waitUntil(() => restored.length > 0)
    expect(restored).toHaveLength(1)
    expect(
      (restored[0].channels.search[0] as { bursts: { budget: string }[] }).bursts[0]
        .budget
    ).toBe("$20,000.00")
    expect(latest?.recovery).toBeNull()
    expect(latest?.activeDraft).toBeTruthy()
  })

  it("does not auto-apply a stale draft; Load anyway applies", async () => {
    await renderProbe(true, 4401)
    await waitUntil(() => latest?.recovery != null)
    expect(restored).toEqual([])
    expect(latest?.recovery).toBeTruthy()
    expect(latest?.loadKind).toBe("stale")

    await act(async () => {
      latest?.resume()
    })
    expect(restored).toHaveLength(1)
    expect(latest?.recovery).toBeNull()
    expect(latest?.activeDraft).toBeTruthy()
  })

  it("Discard after auto-apply reverts to the captured tip and deletes the server row", async () => {
    await renderProbe(true)
    await waitUntil(() => restored.length > 0)
    expect(latest?.activeDraft).toBeTruthy()

    await act(async () => {
      await latest?.discard()
    })
    expect(latest?.activeDraft).toBeNull()
    expect(latest?.recovery).toBeNull()
    expect(reverted).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/plans/drafts?masterId=1"),
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("deleted line: empty search array is in the auto-applied state", async () => {
    const deleted: PlanDraftStateV1 = {
      ...GLENDA_DRAFT,
      channels: { search: [], television: [] },
      meta: { ...GLENDA_DRAFT.meta, lineCount: 0, budgetCents: 0 },
    }
    fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/plans/drafts") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            draft: {
              updatedAt: "2026-08-14T00:00:00.000Z",
              draftStateJson: deleted,
              baseVersionId: 4347,
            },
            others: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }
      return new Response("not found", { status: 404 })
    })
    await renderProbe(true)
    await waitUntil(() => restored.length > 0)
    expect(restored[0]?.channels.search).toEqual([])
  })

  it("create page: empty local draft is deleted silently with no banner", async () => {
    vi.spyOn(localStore, "readLocalDraft").mockResolvedValue({
      key: "mba: ::luke",
      updatedAt: "2026-08-13T00:00:00.000Z",
      state: EMPTY_SNAPSHOT,
    })
    const clearSpy = vi.spyOn(localStore, "clearLocalDraft").mockResolvedValue(undefined)
    await renderCreateProbe()
    await waitUntil(() => clearSpy.mock.calls.length > 0)
    expect(restored).toEqual([])
    expect(latest?.recovery).toBeNull()
    expect(latest?.activeDraft).toBeNull()
    expect(latest?.loadKind).toBe("none")
    expect(clearSpy).toHaveBeenCalled()
  })

  it("create page: meaningful local draft auto-applies with descriptive label", async () => {
    const meaningful: PlanDraftStateV1 = {
      ...EMPTY_SNAPSHOT,
      formValues: { mp_client_name: "Penfold", mp_campaignname: "Summer brand" },
      channels: { search: [{ line_item_id: "pen-se1" }] },
      meta: { lineCount: 1, budgetCents: 500_000 },
    }
    vi.spyOn(localStore, "readLocalDraft").mockResolvedValue({
      key: "mba: ::luke",
      updatedAt: "2026-08-13T00:00:00.000Z",
      state: meaningful,
    })
    await renderCreateProbe()
    await waitUntil(() => restored.length > 0)
    expect(restored).toHaveLength(1)
    expect(restored[0]?.formValues.mp_client_name).toBe("Penfold")
    expect(latest?.activeDraft).toBeTruthy()
    expect(latest?.activeDraft?.headline).toBe(
      "Unsaved campaign: Penfold — Summer brand, 1 line, $5000"
    )
    expect(latest?.loadKind).toBe("auto")
  })

  it("create page: 15-day-old meaningful draft is dropped silently", async () => {
    const meaningful: PlanDraftStateV1 = {
      ...EMPTY_SNAPSHOT,
      formValues: { mp_client_name: "Penfold" },
    }
    vi.spyOn(localStore, "readLocalDraft").mockResolvedValue({
      key: "mba: ::luke",
      updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      state: meaningful,
    })
    const clearSpy = vi.spyOn(localStore, "clearLocalDraft").mockResolvedValue(undefined)
    await renderCreateProbe()
    await waitUntil(() => clearSpy.mock.calls.length > 0)
    expect(restored).toEqual([])
    expect(latest?.activeDraft).toBeNull()
    expect(latest?.loadKind).toBe("none")
  })

  it("create page: clearAfterPublish deletes the local create draft", async () => {
    const clearSpy = vi.spyOn(localStore, "clearLocalDraft").mockResolvedValue(undefined)
    await renderCreateProbe()
    await waitUntil(() => latest != null)
    await act(async () => {
      await latest?.clearAfterPublish()
    })
    expect(clearSpy).toHaveBeenCalledWith(
      expect.objectContaining({ masterId: null, mbaNumber: "TEST001" })
    )
  })

  it("a fresh editor with no draft has no banner and no activeDraft", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes("/api/plans/drafts")) {
        return new Response(JSON.stringify({ draft: null, others: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response("not found", { status: 404 })
    })
    await renderProbe(true)
    await waitUntil(() => fetchMock.mock.calls.length > 0)
    await act(async () => {
      await Promise.resolve()
    })
    expect(latest?.recovery).toBeNull()
    expect(latest?.activeDraft).toBeNull()
    expect(latest?.loadKind).toBe("none")
    expect(restored).toEqual([])
  })
})


