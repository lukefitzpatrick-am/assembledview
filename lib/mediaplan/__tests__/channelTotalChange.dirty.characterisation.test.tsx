/**
 * Channel total dirty marking — all create total handlers use applyChannelTotalPair.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { applyChannelTotalPair } from "@/lib/mediaplan/channelTotalChange"
import { useMediaPlanDirtyController } from "@/lib/mediaplan/useMediaPlanDirtyController"

const rootDir = process.cwd()

function read(rel: string) {
  return readFileSync(join(rootDir, rel), "utf8")
}

/**
 * Impure pattern: `let changed` set inside a setState updater and read outside
 * that updater (`if (changed)`). Pure same-updater reads (`return changed ?`) OK.
 */
function impureChangedOutsideUpdater(src: string): number[] {
  const hits: number[] = []
  const re = /let changed = false/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const chunk = src.slice(m.index, m.index + 900)
    const hasOutsideRead = /\bif\s*\(\s*changed\s*\)/.test(chunk)
    if (hasOutsideRead) hits.push(m.index)
  }
  return hits
}

const OFFLINE_TOTAL_HANDLERS = [
  "handleProgOohTotalChange",
  "handleProgAudioTotalChange",
  "handleCinemaTotalChange",
  "handleTelevisionTotalChange",
  "handleRadioTotalChange",
  "handleNewspaperTotalChange",
  "handleMagazinesTotalChange",
  "handleOohTotalChange",
  "handleProductionTotalChange",
  "handleInfluencersTotalChange",
] as const

const ALL_TOTAL_HANDLERS = [
  "handleSearchTotalChange",
  "handleSocialMediaTotalChange",
  "handleDigiAudioTotalChange",
  "handleDigiDisplayTotalChange",
  "handleDigiVideoTotalChange",
  "handleBVODTotalChange",
  "handleIntegrationTotalChange",
  "handleProgDisplayTotalChange",
  "handleProgVideoTotalChange",
  "handleProgBvodTotalChange",
  ...OFFLINE_TOTAL_HANDLERS,
] as const

describe("applyChannelTotalPair", () => {
  it("marks dirty exactly once when media or fee changes", () => {
    const mediaRef = { current: 0 }
    const feeRef = { current: 0 }
    let media = 0
    let fee = 0
    let marks = 0
    const marked = applyChannelTotalPair({
      mediaRef,
      feeRef,
      setMedia: (n) => {
        media = n
      },
      setFee: (n) => {
        fee = n
      },
      totalMedia: 100,
      totalFee: 10,
      markDirty: () => {
        marks += 1
      },
    })
    expect(marked).toBe(true)
    expect(marks).toBe(1)
    expect(media).toBe(100)
    expect(fee).toBe(10)
  })

  it("does not mark when both values are unchanged", () => {
    const mediaRef = { current: 50 }
    const feeRef = { current: 5 }
    let marks = 0
    let setCount = 0
    const marked = applyChannelTotalPair({
      mediaRef,
      feeRef,
      setMedia: () => {
        setCount += 1
      },
      setFee: () => {
        setCount += 1
      },
      totalMedia: 50,
      totalFee: 5,
      markDirty: () => {
        marks += 1
      },
    })
    expect(marked).toBe(false)
    expect(marks).toBe(0)
    expect(setCount).toBe(0)
  })

  it("two total changes in the same tick both mark dirty", () => {
    const mediaRef = { current: 0 }
    const feeRef = { current: 0 }
    let marks = 0
    const markDirty = () => {
      marks += 1
    }
    applyChannelTotalPair({
      mediaRef,
      feeRef,
      setMedia: () => {},
      setFee: () => {},
      totalMedia: 10,
      totalFee: 1,
      markDirty,
    })
    applyChannelTotalPair({
      mediaRef,
      feeRef,
      setMedia: () => {},
      setFee: () => {},
      totalMedia: 20,
      totalFee: 2,
      markDirty,
    })
    expect(marks).toBe(2)
  })
})

describe("create total handlers (all channels)", () => {
  it.each([...ALL_TOTAL_HANDLERS])(
    "%s uses applyChannelTotalPair + markUnsavedChanges",
    (handlerName) => {
      const create = read("app/mediaplans/create/page.tsx")
      const start = create.indexOf(`const ${handlerName}`)
      expect(start).toBeGreaterThanOrEqual(0)
      const next = create.indexOf("\n  const handle", start + 10)
      const body = create.slice(start, next > start ? next : start + 600)
      expect(body).toMatch(/applyChannelTotalPair/)
      expect(body).toMatch(/markDirty:\s*markUnsavedChanges/)
      expect(body).not.toMatch(/let changed = false/)
    }
  )
})

describe("changed-flag purity", () => {
  it("create has no let changed that is read outside a setState updater", () => {
    const create = read("app/mediaplans/create/page.tsx")
    expect(impureChangedOutsideUpdater(create)).toEqual([])
    expect(create.match(/let changed = false/g)).toBeNull()
  })

  it("edit may keep same-updater changed flags; none read outside the updater", () => {
    const edit = read("app/mediaplans/mba/[mba_number]/edit/page.tsx")
    expect(impureChangedOutsideUpdater(edit)).toEqual([])
  })
})

describe("same-tick total changes with pending React update", () => {
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

  it("two channel total changes in one act both mark dirty once each", () => {
    let api: {
      openGate: () => void
      changeA: (m: number, f: number) => void
      changeB: (m: number, f: number) => void
      marks: { n: number }
      hasUnsavedChanges: boolean
    } | null = null

    function Harness() {
      const dirty = useMediaPlanDirtyController()
      const marks = useRef({ n: 0 })
      const mediaA = useRef(0)
      const feeA = useRef(0)
      const mediaB = useRef(0)
      const feeB = useRef(0)
      const [, setMediaA] = useState(0)
      const [, setFeeA] = useState(0)
      const [, setMediaB] = useState(0)
      const [, setFeeB] = useState(0)
      // Seed a pending update so setState updaters would be deferred (old bug class).
      const [, setTick] = useState(0)

      api = {
        openGate: dirty.openGate,
        changeA: (totalMedia, totalFee) => {
          applyChannelTotalPair({
            mediaRef: mediaA,
            feeRef: feeA,
            setMedia: setMediaA,
            setFee: setFeeA,
            totalMedia,
            totalFee,
            markDirty: () => {
              marks.current.n += 1
              dirty.markUnsavedChanges()
            },
          })
        },
        changeB: (totalMedia, totalFee) => {
          applyChannelTotalPair({
            mediaRef: mediaB,
            feeRef: feeB,
            setMedia: setMediaB,
            setFee: setFeeB,
            totalMedia,
            totalFee,
            markDirty: () => {
              marks.current.n += 1
              dirty.markUnsavedChanges()
            },
          })
        },
        marks: marks.current,
        hasUnsavedChanges: dirty.hasUnsavedChanges,
      }

      return (
        <button
          type="button"
          data-testid="seed-pending"
          onClick={() => setTick((t) => t + 1)}
        >
          seed
        </button>
      )
    }

    act(() => {
      root.render(<Harness />)
    })
    act(() => {
      api!.openGate()
      container.querySelector("button")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
      api!.changeA(100, 10)
      api!.changeB(200, 20)
    })
    expect(api!.marks.n).toBe(2)
    expect(api!.hasUnsavedChanges).toBe(true)
  })
})
