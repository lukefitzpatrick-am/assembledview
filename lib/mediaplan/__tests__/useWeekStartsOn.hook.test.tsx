/**
 * React hook: remount (close/reopen) and two channel instances share the store.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  resetWeekStartsOnStore,
  useWeekStartsOn,
} from "@/lib/mediaplan/useWeekStartsOn"
import type { WeekStartsOn } from "@/lib/utils/weeklyGanttColumns"

type HookResult = [WeekStartsOn, (next: WeekStartsOn) => void]

function Probe(props: {
  onResult: (result: HookResult) => void
}) {
  const result = useWeekStartsOn()
  props.onResult(result)
  return <span data-week={String(result[0])} />
}

describe("useWeekStartsOn", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: HookResult | null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    window.localStorage.clear()
    resetWeekStartsOnStore()
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
    resetWeekStartsOnStore()
    window.localStorage.clear()
  })

  it("nothing stored → Sunday", () => {
    act(() => {
      root.render(
        <Probe
          onResult={(r) => {
            latest = r
          }}
        />
      )
    })
    expect(latest?.[0]).toBe(0)
  })

  it("set Monday, close the grid, reopen → Monday", () => {
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
      latest![1](1)
    })
    expect(latest?.[0]).toBe(1)

    act(() => {
      root.unmount()
    })
    latest = null
    root = createRoot(container)
    act(() => {
      root.render(
        <Probe
          onResult={(r) => {
            latest = r
          }}
        />
      )
    })
    expect(latest?.[0]).toBe(1)
  })

  it("set Monday, reload → Monday", () => {
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
      latest![1](1)
    })
    act(() => {
      root.unmount()
    })
    resetWeekStartsOnStore()
    latest = null
    root = createRoot(container)
    act(() => {
      root.render(
        <Probe
          onResult={(r) => {
            latest = r
          }}
        />
      )
    })
    expect(latest?.[0]).toBe(1)
    expect(window.localStorage.getItem("av:week-starts-on")).toBe("1")
  })

  it("set Monday on Television, open Radio → Monday", () => {
    const radio = document.createElement("div")
    document.body.appendChild(radio)
    const radioRoot = createRoot(radio)
    let tv: HookResult | null = null
    let radioLatest: HookResult | null = null

    act(() => {
      root.render(
        <Probe
          onResult={(r) => {
            tv = r
          }}
        />
      )
      radioRoot.render(
        <Probe
          onResult={(r) => {
            radioLatest = r
          }}
        />
      )
    })
    expect(tv?.[0]).toBe(0)
    expect(radioLatest?.[0]).toBe(0)

    act(() => {
      tv![1](1)
    })
    expect(tv?.[0]).toBe(1)
    expect(radioLatest?.[0]).toBe(1)

    act(() => {
      radioRoot.unmount()
    })
    radio.remove()
  })
})
