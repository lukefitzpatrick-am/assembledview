/**
 * S4: useClientFeesOnPlanStart, the one start-date re-read both plan pages
 * use. Mounted: a client applies its fees, a new start across a change date
 * applies the new rate, the same start (RHF keeps the Date) does not apply
 * again, and no client applies nothing.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { planClientFeeState, useClientFeesOnPlanStart } from "@/app/mediaplans/_form/clientFees"

type Row = Record<string, unknown>
const CLIENT: Row = {
  feesearch: 10,
  fee_rate_changes: [{ field: "feesearch", ratePct: 12, effectiveFrom: "2026-12-01" }],
}

const applied: Array<number | null | undefined> = []
const apply = (client: Row, planStart: unknown) => {
  applied.push(planClientFeeState(client, planStart).feesearch)
}

function Probe({ client, start }: { client: Row | null; start: Date }) {
  useClientFeesOnPlanStart(client, start, apply)
  return null
}

describe("useClientFeesOnPlanStart (S4)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    applied.length = 0
    container = document.createElement("div")
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  const render = (client: Row | null, start: Date) => act(() => root.render(<Probe client={client} start={start} />))

  it("applies on mount, again for a new start across the change date, not for the same start", () => {
    const before = new Date(2026, 10, 30)
    render(CLIENT, before)
    expect(applied).toEqual([10])
    render(CLIENT, before)
    expect(applied).toEqual([10])
    render(CLIENT, new Date(2026, 11, 1))
    expect(applied).toEqual([10, 12])
  })

  it("no client applies nothing; picking one applies it", () => {
    const start = new Date(2026, 11, 5)
    render(null, start)
    expect(applied).toEqual([])
    render(CLIENT, start)
    expect(applied).toEqual([12])
  })
})
