import { describe, expect, it } from "vitest"

import {
  computeAllChannelsHydrated,
  isSaveAllowedAfterHydration,
  reconciliationBadgeVisibility,
} from "@/lib/mediaplan/channelHydrationGate"

describe("channelHydrationGate", () => {
  it("computeAllChannelsHydrated: false while loadPhase is not ready", () => {
    expect(
      computeAllChannelsHydrated({
        loadPhase: "loadingLineItems",
        expectedFlags: ["mp_search"],
        mediaLoadStatus: { mp_search: "ready" },
        settledFlags: { mp_search: true },
      })
    ).toBe(false)
  })

  it("computeAllChannelsHydrated: true when no channels expected and ready", () => {
    expect(
      computeAllChannelsHydrated({
        loadPhase: "ready",
        expectedFlags: [],
        mediaLoadStatus: {},
        settledFlags: {},
      })
    ).toBe(true)
  })

  it("computeAllChannelsHydrated: false until every expected channel settles", () => {
    expect(
      computeAllChannelsHydrated({
        loadPhase: "ready",
        expectedFlags: ["mp_search", "mp_socialmedia", "mp_television", "mp_progdisplay"],
        mediaLoadStatus: {
          mp_search: "ready",
          mp_socialmedia: "ready",
          mp_television: "ready",
          mp_progdisplay: "ready",
        },
        settledFlags: {
          mp_search: true,
          mp_socialmedia: true,
          mp_television: true,
          // progdisplay still mounting / hydrating
        },
      })
    ).toBe(false)
  })

  it("computeAllChannelsHydrated: true when all expected channels settled", () => {
    expect(
      computeAllChannelsHydrated({
        loadPhase: "ready",
        expectedFlags: ["mp_search", "mp_socialmedia"],
        mediaLoadStatus: { mp_search: "ready", mp_socialmedia: "ready" },
        settledFlags: { mp_search: true, mp_socialmedia: true },
      })
    ).toBe(true)
  })

  it("computeAllChannelsHydrated: error status counts as settled (does not block forever)", () => {
    expect(
      computeAllChannelsHydrated({
        loadPhase: "ready",
        expectedFlags: ["mp_search", "mp_television"],
        mediaLoadStatus: { mp_search: "ready", mp_television: "error" },
        settledFlags: { mp_search: true },
      })
    ).toBe(true)
  })

  it("computeAllChannelsHydrated: still-loading status blocks even if settled flag set", () => {
    expect(
      computeAllChannelsHydrated({
        loadPhase: "ready",
        expectedFlags: ["mp_search"],
        mediaLoadStatus: { mp_search: "loading" },
        settledFlags: { mp_search: true },
      })
    ).toBe(false)
  })

  it("reconciliationBadgeVisibility: neither green nor red before hydration", () => {
    expect(reconciliationBadgeVisibility(false, true)).toEqual({
      showEquals: false,
      showMismatch: false,
    })
    expect(reconciliationBadgeVisibility(false, false)).toEqual({
      showEquals: false,
      showMismatch: false,
    })
  })

  it("reconciliationBadgeVisibility: after hydration mirrors billableEqualsMba", () => {
    expect(reconciliationBadgeVisibility(true, true)).toEqual({
      showEquals: true,
      showMismatch: false,
    })
    expect(reconciliationBadgeVisibility(true, false)).toEqual({
      showEquals: false,
      showMismatch: true,
    })
  })

  it("isSaveAllowedAfterHydration: denied until hydrated", () => {
    expect(isSaveAllowedAfterHydration(false)).toBe(false)
    expect(isSaveAllowedAfterHydration(true)).toBe(true)
  })
})
