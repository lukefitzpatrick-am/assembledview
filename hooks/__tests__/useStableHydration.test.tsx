/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useStableHydration } from "@/hooks/useStableHydration"

function Probe({
  items,
  onHydrate,
}: {
  items: { budget: string }[] | undefined
  onHydrate: (rows: { budget: string }[]) => void
}) {
  useStableHydration(items, onHydrate)
  return null
}

describe("useStableHydration — draft resume", () => {
  let container: HTMLDivElement
  let root: Root
  let hydrated: { budget: string }[][]

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    hydrated = []
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("skips the first empty paint so tip load can arrive", () => {
    act(() => {
      root.render(<Probe items={[]} onHydrate={(rows) => hydrated.push(rows)} />)
    })
    expect(hydrated).toEqual([])
  })

  it("re-hydrates when resume supplies a new array with the edited burst", () => {
    const tip = [{ budget: "$25,000.00" }]
    act(() => {
      root.render(<Probe items={tip} onHydrate={(rows) => hydrated.push(rows)} />)
    })
    expect(hydrated.at(-1)?.[0]?.budget).toBe("$25,000.00")

    const draft = [{ budget: "$20,000.00" }]
    act(() => {
      root.render(<Probe items={draft} onHydrate={(rows) => hydrated.push(rows)} />)
    })
    expect(hydrated.at(-1)?.[0]?.budget).toBe("$20,000.00")
  })

  it("stays expanded after a buy type change: an own publish does not hydrate", () => {
    const loaded = [{ budget: "$25,000.00" }]
    const ownPublishRef: { current: { budget: string }[] | null } = { current: null }
    function ProbeWithPublish({
      items,
      onHydrate,
    }: {
      items: { budget: string }[] | undefined
      onHydrate: (rows: { budget: string }[]) => void
    }) {
      useStableHydration(items, onHydrate, undefined, ownPublishRef)
      return null
    }

    act(() => {
      root.render(<ProbeWithPublish items={loaded} onHydrate={(rows) => hydrated.push(rows)} />)
    })
    expect(hydrated).toHaveLength(1)

    const afterBuyType = [{ budget: "$25,000.00", buyType: "network" } as { budget: string }]
    ownPublishRef.current = afterBuyType
    act(() => {
      root.render(
        <ProbeWithPublish items={afterBuyType} onHydrate={(rows) => hydrated.push(rows)} />,
      )
    })
    expect(hydrated).toHaveLength(1)

    const ingested = [{ budget: "$10,000.00" }]
    act(() => {
      root.render(<ProbeWithPublish items={ingested} onHydrate={(rows) => hydrated.push(rows)} />)
    })
    expect(hydrated).toHaveLength(2)
    expect(hydrated.at(-1)?.[0]?.budget).toBe("$10,000.00")
  })

  it("re-hydrates to empty after a prior load (deleted line)", () => {
    const tip = [{ budget: "$25,000.00" }]
    act(() => {
      root.render(<Probe items={tip} onHydrate={(rows) => hydrated.push(rows)} />)
    })
    act(() => {
      root.render(<Probe items={[]} onHydrate={(rows) => hydrated.push(rows)} />)
    })
    expect(hydrated.at(-1)).toEqual([])
  })
})
