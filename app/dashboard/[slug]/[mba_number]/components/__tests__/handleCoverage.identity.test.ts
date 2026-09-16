import { describe, expect, it, vi } from "vitest"

import type { ChannelCoverageEntry } from "@/lib/delivery/channelCoverage"
import {
  applyCoverageIfChanged,
  coverageEntriesIdentityKey,
} from "@/lib/delivery/coverageEntriesIdentity"

/**
 * BICAU006-shaped coverage: Social · Meta, Prog Video · Channel Factory, Social · Reddit.
 * The assembly cannot be mounted in this harness (no RTL, DeliveryDataProvider
 * fetches, next/navigation). This tests handleCoverage's equality guard in isolation.
 */
function bicau006Entry(
  partial: Pick<ChannelCoverageEntry, "key" | "label"> & Partial<ChannelCoverageEntry>,
): ChannelCoverageEntry {
  return {
    colour: "var(--channel-social)",
    plannedSpend: 10_000,
    plannedImpressions: 100_000,
    deliveredSpend: 2_000,
    deliveredImpressions: 20_000,
    status: "reporting",
    spendModelled: false,
    startsOn: null,
    deliveryStatus: "on-track",
    impressionsStatus: "on-track",
    ...partial,
  }
}

const BICAU006_COVERAGE: ChannelCoverageEntry[] = [
  bicau006Entry({ key: "social-meta", label: "Social · Meta" }),
  bicau006Entry({
    key: "programmatic-video-channel-factory",
    label: "Prog Video · Channel Factory",
    colour: "var(--channel-bvod)",
    spendModelled: true,
  }),
  bicau006Entry({ key: "social-reddit", label: "Social · Reddit" }),
]

function simulateHandleCoverage() {
  let prev: ChannelCoverageEntry[] = []
  let setCoverageCalls = 0
  let lastCommitted: ChannelCoverageEntry[] | undefined
  const handleCoverage = (entries: ChannelCoverageEntry[]) => {
    const decision = applyCoverageIfChanged(prev, entries)
    if (!decision.commit) return
    prev = decision.nextPrev
    setCoverageCalls += 1
    lastCommitted = entries
  }
  return {
    handleCoverage,
    get setCoverageCalls() {
      return setCoverageCalls
    },
    get lastCommitted() {
      return lastCommitted
    },
  }
}

describe("handleCoverage equality guard", () => {
  it("commits BICAU006 coverage at most twice when identity is unchanged", () => {
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args)
    })
    const sim = simulateHandleCoverage()

    const clone = (): ChannelCoverageEntry[] => BICAU006_COVERAGE.map((e) => ({ ...e }))
    sim.handleCoverage(clone())
    sim.handleCoverage(clone())
    sim.handleCoverage(clone())
    sim.handleCoverage(clone())

    expect(sim.setCoverageCalls).toBeLessThanOrEqual(2)
    expect(sim.setCoverageCalls).toBe(1)
    expect(errors).toEqual([])
    spy.mockRestore()
  })

  it("commits again when any ChannelCoverageEntry field changes", () => {
    const sim = simulateHandleCoverage()
    sim.handleCoverage(BICAU006_COVERAGE)
    sim.handleCoverage(
      BICAU006_COVERAGE.map((e, i) =>
        i === 0 ? { ...e, deliveredImpressions: e.deliveredImpressions + 1 } : e,
      ),
    )
    expect(sim.setCoverageCalls).toBe(2)
  })

  it("joins every ChannelCoverageEntry field in type order", () => {
    const [entry] = BICAU006_COVERAGE
    expect(entry).toBeDefined()
    const key = coverageEntriesIdentityKey([entry!])
    expect(key).toBe(
      [
        entry!.key,
        entry!.label,
        entry!.colour,
        entry!.plannedSpend,
        entry!.plannedImpressions,
        entry!.deliveredSpend,
        entry!.deliveredImpressions,
        entry!.status,
        entry!.spendModelled,
        entry!.startsOn,
        entry!.deliveryStatus,
        entry!.impressionsStatus,
      ].join("\u001f"),
    )
  })
})
