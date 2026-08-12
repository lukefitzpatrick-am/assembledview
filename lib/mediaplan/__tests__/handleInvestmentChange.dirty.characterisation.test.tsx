/**
 * Characterisation: channel investment dirty marking must not emit from inside
 * a setState updater (render-phase update → React warning).
 *
 * Mirrors EditMediaPlan / create handleInvestmentChange + dirty controller.
 * Channel containers republish investment from effects (same trigger shape).
 *
 * @vitest-environment jsdom
 */
import {
  act,
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useMediaPlanDirtyController } from "@/lib/mediaplan/useMediaPlanDirtyController"

type Api = {
  hasUnsavedChanges: boolean
  openGate: () => void
  handleInvestmentChange: (channel: string, rows: unknown[]) => void
  markCount: { n: number }
}

function isRenderPhaseUpdateWarning(args: unknown[]): boolean {
  const msg = args.map(String).join(" ")
  return (
    msg.includes("Cannot update a component") &&
    (msg.includes("while rendering a different component") ||
      msg.includes("while rendering a component"))
  )
}

/** Mirrors channel containers republishing investment from an effect. */
function ChannelInvestmentPublisher({
  onInvestmentChange,
  rows,
}: {
  onInvestmentChange: (channel: string, rows: unknown[]) => void
  rows: unknown[]
}) {
  useEffect(() => {
    onInvestmentChange("search", rows)
  }, [onInvestmentChange, rows])
  return <span data-testid="channel-publisher" />
}

/** Fixed pattern: compare + mark outside the updater; setState gets a plain next value. */
function FixedInvestmentEditor({
  onApi,
  children,
  publishRows,
}: {
  onApi: (api: Api) => void
  children?: ReactNode
  /** When set, child effect republishes these rows (editor open path). */
  publishRows?: unknown[]
}) {
  const dirty = useMediaPlanDirtyController()
  const [investmentPerMonthByChannel, setInvestmentPerMonthByChannel] = useState<
    Record<string, unknown[]>
  >({})
  const investmentPerMonthByChannelRef = useRef(investmentPerMonthByChannel)
  const markCount = useRef({ n: 0 })

  const handleInvestmentChange = useCallback(
    (channel: string, rows: unknown[]) => {
      const prev = investmentPerMonthByChannelRef.current
      if (JSON.stringify(prev[channel] ?? []) === JSON.stringify(rows)) return
      const next = { ...prev, [channel]: rows }
      investmentPerMonthByChannelRef.current = next
      setInvestmentPerMonthByChannel(next)
      markCount.current.n += 1
      dirty.markPassiveChannelChange()
    },
    [dirty]
  )

  onApi({
    hasUnsavedChanges: dirty.hasUnsavedChanges,
    openGate: dirty.openGate,
    handleInvestmentChange,
    markCount: markCount.current,
  })

  return (
    <div data-dirty={String(dirty.hasUnsavedChanges)} data-testid="editor">
      {publishRows ? (
        <ChannelInvestmentPublisher
          onInvestmentChange={handleInvestmentChange}
          rows={publishRows}
        />
      ) : null}
      {children}
    </div>
  )
}

/** Legacy defect witness: impure mark inside updater, triggered during child render. */
function BrokenInvestmentEditor({
  onApi,
}: {
  onApi: (api: Api) => void
}) {
  const dirty = useMediaPlanDirtyController()
  const [, setInvestmentPerMonthByChannel] = useState<Record<string, unknown[]>>(
    {}
  )
  const markCount = useRef({ n: 0 })

  const gateOpenedRef = useRef(false)
  if (!gateOpenedRef.current) {
    gateOpenedRef.current = true
    dirty.openGate()
  }

  const handleInvestmentChange = useCallback(
    (channel: string, rows: unknown[]) => {
      setInvestmentPerMonthByChannel((prev) => {
        if (JSON.stringify(prev[channel] ?? []) === JSON.stringify(rows)) return prev
        markCount.current.n += 1
        dirty.markPassiveChannelChange()
        return { ...prev, [channel]: rows }
      })
    },
    [dirty]
  )

  onApi({
    hasUnsavedChanges: dirty.hasUnsavedChanges,
    openGate: dirty.openGate,
    handleInvestmentChange,
    markCount: markCount.current,
  })

  // Channel containers normally fire from effects; calling during render is the
  // reliable way to force the updater onto the render phase in this harness.
  return (
    <div data-dirty={String(dirty.hasUnsavedChanges)} data-testid="editor">
      <BrokenInvestmentTrigger onInvestmentChange={handleInvestmentChange} />
    </div>
  )
}

function BrokenInvestmentTrigger({
  onInvestmentChange,
}: {
  onInvestmentChange: (channel: string, rows: unknown[]) => void
}) {
  const fired = useRef(false)
  if (!fired.current) {
    fired.current = true
    onInvestmentChange("search", [{ month: "2026-01", amount: 100 }])
  }
  return <span data-testid="broken-trigger" />
}

describe("handleInvestmentChange dirty characterisation", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: Api | null
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    latest = null
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    consoleErrorSpy.mockRestore()
  })

  function renderFixed(strict = false, publishRows?: unknown[]) {
    const tree = (
      <FixedInvestmentEditor
        publishRows={publishRows}
        onApi={(api) => {
          latest = api
        }}
      />
    )
    act(() => {
      root.render(strict ? <StrictMode>{tree}</StrictMode> : tree)
    })
  }

  function renderBroken() {
    act(() => {
      root.render(
        <BrokenInvestmentEditor
          onApi={(api) => {
            latest = api
          }}
        />
      )
    })
  }

  function renderPhaseWarnings(): unknown[][] {
    return consoleErrorSpy.mock.calls.filter((args) => isRenderPhaseUpdateWarning(args))
  }

  it("regression witness: mark inside updater raises render-phase update warning", () => {
    renderBroken()
    expect(renderPhaseWarnings().length).toBeGreaterThan(0)
  })

  it("renders editor; channel investment change raises no render-phase update warning", () => {
    const rows = [{ month: "2026-01", amount: 100 }]
    renderFixed(false, rows)
    act(() => {
      latest!.openGate()
    })
    act(() => {
      latest!.handleInvestmentChange("search", [{ month: "2026-01", amount: 101 }])
    })
    expect(renderPhaseWarnings()).toEqual([])
    expect(latest!.hasUnsavedChanges).toBe(true)
  })

  it("identical rows do NOT mark the plan dirty", () => {
    renderFixed()
    const rows = [{ month: "2026-01", amount: 50 }]
    act(() => {
      latest!.openGate()
      latest!.handleInvestmentChange("ooh", rows)
    })
    expect(latest!.hasUnsavedChanges).toBe(true)
    expect(latest!.markCount.n).toBe(1)

    act(() => {
      latest!.handleInvestmentChange("ooh", [{ month: "2026-01", amount: 50 }])
    })
    expect(latest!.markCount.n).toBe(1)
    expect(renderPhaseWarnings()).toEqual([])
  })

  it("different rows mark dirty exactly once", () => {
    renderFixed()
    act(() => {
      latest!.openGate()
      latest!.handleInvestmentChange("tv", [{ month: "2026-01", amount: 1 }])
    })
    expect(latest!.markCount.n).toBe(1)
    expect(latest!.hasUnsavedChanges).toBe(true)
    expect(renderPhaseWarnings()).toEqual([])
  })

  it("under StrictMode double-invocation a single change marks dirty once", () => {
    renderFixed(true)
    act(() => {
      latest!.openGate()
      latest!.handleInvestmentChange("radio", [{ month: "2026-02", amount: 9 }])
    })
    expect(latest!.markCount.n).toBe(1)
    expect(latest!.hasUnsavedChanges).toBe(true)
    expect(renderPhaseWarnings()).toEqual([])
  })

  it("opening a plan and touching nothing leaves hasUnsavedChanges false", () => {
    renderFixed()
    act(() => {
      latest!.openGate()
    })
    expect(latest!.hasUnsavedChanges).toBe(false)
    expect(latest!.markCount.n).toBe(0)
  })
})
