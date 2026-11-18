/**
 * W5d (review F5): a rounded channel compares the old and new deliverables as
 * numbers, as Digital Audio did. A burst whose deliverables are the string
 * "1" keeps the string when the recalculation gives 1; a raw channel writes
 * the number. No card is mounted: the hook's recalculation alone decides.
 *
 * Hydrate always writes numbers, and a card field rewrites a typed string on
 * a buy type change, so the string is set on the form here.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  DIGITALAUDIO_CONTAINER_CONFIG,
  DIGITALVIDEO_CONTAINER_CONFIG,
  type ContainerChannelConfig,
} from "@/lib/mediaplan/containerChannelConfig"
import { useMediaChannelContainer } from "@/lib/mediaplan/useMediaChannelContainer"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublishersForDigiVideo: async () => [],
  getPublishersForDigiAudio: async () => [],
}))

const noop = () => {}
const LINES = [
  {
    line_item_id: "tst001XX1",
    line_item: 1,
    publisher: "Pub A",
    buy_type: "fixed_cost",
    bursts: [
      { budget: "$1,000.00", buyAmount: "$1,000.00", startDate: "2026-01-05", endDate: "2026-01-31" },
    ],
  },
]

type Hook = ReturnType<typeof useMediaChannelContainer>

function Harness({ config, out }: { config: ContainerChannelConfig; out: { hook?: Hook } }) {
  out.hook = useMediaChannelContainer(config, {
    clientId: "client-1",
    feePct: 10,
    onTotalMediaChange: noop,
    onBurstsChange: noop,
    onInvestmentChange: noop,
    onLineItemsChange: noop,
    onMediaLineItemsChange: noop,
    campaignStartDate: new Date(2026, 0, 5),
    campaignEndDate: new Date(2026, 2, 31),
    campaignBudget: 0,
    campaignId: "",
    mediaTypes: [],
    initialLineItems: LINES,
  })
  return null
}

describe("rounded deliverables compare as numbers (W5d)", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  async function recalculated(config: ContainerChannelConfig): Promise<unknown> {
    const out: { hook?: Hook } = {}
    act(() => root.render(<Harness config={config} out={out} />))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    const path = "lineItems.0.bursts.0.calculatedValue"
    expect(out.hook!.form.getValues(path), "fixed cost deliverables").toBe(1)
    act(() => out.hook!.form.setValue(path, "1"))
    act(() => out.hook!.handleValueChange(0, 0))
    return out.hook!.form.getValues(path)
  }

  it("keeps the string \"1\" on a rounded channel (Digital Audio)", async () => {
    expect(DIGITALAUDIO_CONTAINER_CONFIG.deliverableRoundingPolicy).toBe("rounded")
    expect(await recalculated(DIGITALAUDIO_CONTAINER_CONFIG)).toBe("1")
  })

  it("writes the number 1 on a raw channel (Digital Video)", async () => {
    expect(DIGITALVIDEO_CONTAINER_CONFIG.deliverableRoundingPolicy).toBe("raw")
    expect(await recalculated(DIGITALVIDEO_CONTAINER_CONFIG)).toBe(1)
  })
})
