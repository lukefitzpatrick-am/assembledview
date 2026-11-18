/**
 * B58: a refused save that is a field's own error (end date before start) is
 * said once and moves focus to the field; it toasts nothing. Any other stop
 * still toasts and says nothing. B58fix R3: the field it is about, never
 * another invalid control; a toast when no field shows the message.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { planSavePreflight, showSaveStop, type CreateSaveChecks } from "@/app/mediaplans/_form/savePreflight"
import { EndDateOrderMessage } from "@/components/mediaplan/EndDateOrderMessage"
import { Announcer } from "@/components/ui/announcer"
import { END_BEFORE_START_MESSAGE } from "@/lib/mediaplan/dateOrder"

const createOk: CreateSaveChecks = {
  mode: "create",
  clientsError: null,
  clientsBlocked: false,
  datesOutOfOrder: false,
  saveInFlight: false,
  mbaNumberPending: false,
  mbaNumberProblem: null,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const assertive = () => container.querySelector<HTMLElement>('[data-announcer="assertive"]')!

function stop(checks: Partial<CreateSaveChecks>) {
  const found = planSavePreflight({ ...createOk, ...checks })
  expect(found).toBeTruthy()
  return found!
}

describe("showSaveStop", () => {
  it("dates out of order: says the message once, focuses the invalid end date, no toast", () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <input aria-label="Start date" />
          <input aria-label="End date" aria-invalid="true" aria-describedby="end-error" />
          <p id="end-error">{END_BEFORE_START_MESSAGE}</p>
        </>,
      ),
    )
    const toast = vi.fn()
    act(() => showSaveStop(stop({ datesOutOfOrder: true }), toast))
    expect(toast).not.toHaveBeenCalled()
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toBe(END_BEFORE_START_MESSAGE)
    expect(document.activeElement?.getAttribute("aria-label")).toBe("End date")
  })

  it("a burst row out of order (no field marked): focus goes to its message", () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <EndDateOrderMessage start="2026-12-10" end="2026-12-01" />
        </>,
      ),
    )
    act(() => showSaveStop(stop({ datesOutOfOrder: true }), vi.fn()))
    expect((document.activeElement as HTMLElement | null)?.dataset.dateOrderError).toBe("")
    expect(document.activeElement?.textContent).toBe(END_BEFORE_START_MESSAGE)
  })

  it("B58fix R3: focus goes to the field the stop is about, never another invalid control, and the end date before a burst message", () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <input aria-label="Fixed cost" aria-invalid="true" aria-describedby="cost-error" />
          <p id="cost-error">Fixed cost must be a number</p>
          <input aria-label="Budget" aria-invalid="true" />
          <EndDateOrderMessage start="2026-12-10" end="2026-12-01" />
          <input aria-label="End date" aria-invalid="true" aria-describedby="end-hint end-error" />
          <p id="end-hint">Last day on air</p>
          <p id="end-error">{END_BEFORE_START_MESSAGE}</p>
        </>,
      ),
    )
    const toast = vi.fn()
    act(() => showSaveStop(stop({ datesOutOfOrder: true }), toast))
    expect(document.activeElement?.getAttribute("aria-label")).toBe("End date")
    expect(toast).not.toHaveBeenCalled()
  })

  it("B58fix R3: only a burst row out of order beside an unrelated invalid control: focus goes to the burst message", () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <input aria-label="Fixed cost" aria-invalid="true" aria-describedby="cost-error" />
          <p id="cost-error">Fixed cost must be a number</p>
          <EndDateOrderMessage start="2026-12-10" end="2026-12-01" />
        </>,
      ),
    )
    act(() => showSaveStop(stop({ datesOutOfOrder: true }), vi.fn()))
    expect((document.activeElement as HTMLElement | null)?.dataset.dateOrderError).toBe("")
  })

  it("B58fix R3: no field on the page shows the dates message (a burst on a standard container): it toasts and says nothing", () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <input aria-label="Fixed cost" aria-invalid="true" />
        </>,
      ),
    )
    const before = assertive().innerHTML
    const toast = vi.fn()
    act(() => showSaveStop(stop({ datesOutOfOrder: true }), toast))
    expect(toast).toHaveBeenCalledWith({ title: "Publish disabled", description: END_BEFORE_START_MESSAGE, variant: "destructive" })
    expect(assertive().innerHTML).toBe(before)
    expect(document.activeElement).toBe(document.body)
  })

  it("any other stop toasts as before and says nothing", () => {
    act(() => root.render(<Announcer />))
    const before = assertive().innerHTML
    const toast = vi.fn()
    act(() => showSaveStop(stop({ mbaNumberProblem: { message: "Wrong client", refetch: false } }), toast))
    expect(toast).toHaveBeenCalledWith({ title: "Not saved", description: "Wrong client", variant: "destructive" })
    expect(assertive().innerHTML).toBe(before)
    act(() => showSaveStop(stop({ saveInFlight: true }), toast))
    expect(toast).toHaveBeenCalledTimes(1)
  })
})
