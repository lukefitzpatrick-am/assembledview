/**
 * W5g: the load de-dupe keys Radio and Integration name in their configs.
 * A repeated line id keeps its first line; an id-less line is a repeat only
 * when every fallback field matches, so two id-less Radio lines that differ
 * only in placement (or reach network and station through platform and site)
 * are judged on those fields.
 */
import { describe, expect, it, vi } from "vitest"

import {
  dedupeInitialLineItems,
  INTEGRATION_LOAD_DEDUPE,
  initialLinesLoadKey,
  RADIO_LOAD_DEDUPE,
} from "@/lib/mediaplan/dedupeInitialLineItems"

const radio = (extra: Record<string, unknown>): Record<string, unknown> => ({
  market: "Sydney",
  network: "Nova",
  station: "Nova 100",
  buy_type: "spots",
  placement: "Breakfast",
  ...extra,
})

describe("dedupeInitialLineItems (W5g)", () => {
  it("keeps the first of a repeated line id", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const items = [radio({ line_item_id: "a1", n: 1 }), radio({ line_item_id: "a1", n: 2 }), radio({ id: 9, n: 3 })]
    expect(dedupeInitialLineItems(items, "t", RADIO_LOAD_DEDUPE).map((i) => i.n)).toEqual([1, 3])
  })

  it("judges id-less Radio lines on market, network, station, buy type and placement", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const items = [
      radio({ n: 1 }),
      radio({ n: 2, placement: "Drive" }),
      radio({ n: 3, station: "smoothfm" }),
      radio({ n: 4 }),
      // The same line, its network and station saved as platform and site.
      radio({ n: 5, network: undefined, station: undefined, platform: "Nova", site: "Nova 100" }),
      radio({ n: 6, network: undefined, publisher: "Nova", station: undefined, site: "Nova 100", market: "Perth" }),
      radio({ n: 7, buy_type: undefined, buyType: "spots", market: "Perth", network: undefined, publisher: "Nova" }),
    ]
    expect(dedupeInitialLineItems(items, "t", RADIO_LOAD_DEDUPE).map((i) => i.n)).toEqual([1, 2, 3, 6])
  })

  it("keeps Integration's id-less lines that differ in targeting", () => {
    const items = [
      { n: 1, platform: "X", targeting_attribute: "a" },
      { n: 2, platform: "X", targetingAttribute: "b" },
      { n: 3, platform: "X", targeting_attribute: "a" },
    ]
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(dedupeInitialLineItems(items, "t", INTEGRATION_LOAD_DEDUPE).map((i) => i.n)).toEqual([1, 2])
  })

  it("keys a Radio load on id, market, network, station and buy type, not money", () => {
    const a = [radio({ id: 1, budget: 1 })]
    expect(initialLinesLoadKey(a, RADIO_LOAD_DEDUPE)).toBe(initialLinesLoadKey([radio({ id: 1, budget: 2 })], RADIO_LOAD_DEDUPE))
    expect(initialLinesLoadKey(a, RADIO_LOAD_DEDUPE)).not.toBe(
      initialLinesLoadKey([radio({ id: 1, station: "KIIS" })], RADIO_LOAD_DEDUPE),
    )
  })
})
