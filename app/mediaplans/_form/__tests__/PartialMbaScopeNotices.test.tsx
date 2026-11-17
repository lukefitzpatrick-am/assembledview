/**
 * B52: the MBA billing window's partial MBA scope notices, rendered. Replaces
 * the scope column source pins (legacyPartialEditWiring.b21 and the modal pin
 * in partialMbaBillingGuardEditWiring.b21).
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { partialMbaBillingGuardWhenOn } from "../partialMba"
import { PartialMbaScopeNotices, partialMbaScopeNoticesShown } from "../PartialMbaScopeNotices"

const labels = { digiDisplay: "Digital Display", radio: "Radio", television: "Television" }
const none = { unresolved: [], addedSince: [] }
const unresolved = { unresolved: [{ mediaKey: "digiDisplay", savedId: "X1ML1", reason: "ambiguous" as const }], addedSince: [] }
const addedSince = { unresolved: [], addedSince: [{ mediaKey: "radio", editorId: "X1RA2" }] }
const guard = partialMbaBillingGuardWhenOn({
  on: true,
  isPartial: true,
  allChannelsHydrated: true,
  perLine: [
    {
      lineItemId: "X1TV1",
      mediaType: "television",
      flags: { excluded: false, clientPaysForMedia: false },
      billingMonths: [{ month: "January 2026", amount: 150 }],
      deliveryMonths: [{ month: "January 2026", amount: 100 }],
    },
  ],
  selectedMonthYears: ["January 2026"],
  laterAddedMediaKeys: [],
})

describe("PartialMbaScopeNotices", () => {
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

  const render = (props: Parameters<typeof PartialMbaScopeNotices>[0]) =>
    act(() => {
      root.render(<PartialMbaScopeNotices {...props} />)
    })

  it("is shown only on a partial MBA with a notice", () => {
    expect(guard).not.toBeNull()
    expect(partialMbaScopeNoticesShown({ isPartial: false, notices: unresolved, guard })).toBe(false)
    expect(partialMbaScopeNoticesShown({ isPartial: true, notices: none, guard: null })).toBe(false)
    expect(partialMbaScopeNoticesShown({ isPartial: true, notices: unresolved, guard: null })).toBe(true)
    expect(partialMbaScopeNoticesShown({ isPartial: true, notices: addedSince, guard: null })).toBe(true)
    expect(partialMbaScopeNoticesShown({ isPartial: true, notices: none, guard })).toBe(true)
    render({ isPartial: true, notices: none, guard: null, mediaLabelByKey: labels })
    expect(container.innerHTML).toBe("")
  })

  it("names the unmatched saved lines with the channel label", () => {
    render({ isPartial: true, notices: unresolved, guard: null, mediaLabelByKey: labels })
    const el = container.querySelector('[data-partial-mba-unmatched="1"]')
    expect(el?.textContent).toMatch(/Digital Display/)
    expect(container.querySelector('[data-partial-mba-billing-guard="1"]')).toBeNull()
  })

  it("lists lines added since with the guard switch off (no guard result)", () => {
    render({ isPartial: true, notices: addedSince, guard: null, mediaLabelByKey: labels })
    expect(container.textContent).toMatch(/Radio/)
    expect(container.querySelector('[data-partial-mba-unmatched="1"]')).toBeNull()
  })

  it("shows the billing vs delivery guard when it has a result", () => {
    render({ isPartial: true, notices: none, guard, mediaLabelByKey: labels })
    expect(container.querySelector('[data-partial-mba-billing-guard="1"]')).not.toBeNull()
  })
})
