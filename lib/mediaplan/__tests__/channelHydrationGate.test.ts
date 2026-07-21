import assert from "node:assert/strict"
import test from "node:test"

import {
  computeAllChannelsHydrated,
  isSaveAllowedAfterHydration,
  reconciliationBadgeVisibility,
} from "@/lib/mediaplan/channelHydrationGate"

test("computeAllChannelsHydrated: false while loadPhase is not ready", () => {
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "loadingLineItems",
      expectedFlags: ["mp_search"],
      mediaLoadStatus: { mp_search: "ready" },
      settledFlags: { mp_search: true },
    }),
    false
  )
})

test("computeAllChannelsHydrated: true when no channels expected and ready", () => {
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: [],
      mediaLoadStatus: {},
      settledFlags: {},
    }),
    true
  )
})

test("computeAllChannelsHydrated: false until every expected channel settles", () => {
  assert.equal(
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
    }),
    false
  )
})

test("computeAllChannelsHydrated: true when all expected channels settled", () => {
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: ["mp_search", "mp_socialmedia"],
      mediaLoadStatus: { mp_search: "ready", mp_socialmedia: "ready" },
      settledFlags: { mp_search: true, mp_socialmedia: true },
    }),
    true
  )
})

test("computeAllChannelsHydrated: error status counts as settled (does not block forever)", () => {
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: ["mp_search", "mp_television"],
      mediaLoadStatus: { mp_search: "ready", mp_television: "error" },
      settledFlags: { mp_search: true },
    }),
    true
  )
})

test("computeAllChannelsHydrated: still-loading status blocks even if settled flag set", () => {
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: ["mp_search"],
      mediaLoadStatus: { mp_search: "loading" },
      settledFlags: { mp_search: true },
    }),
    false
  )
})

test("reconciliationBadgeVisibility: neither green nor red before hydration", () => {
  assert.deepEqual(reconciliationBadgeVisibility(false, true), {
    showEquals: false,
    showMismatch: false,
  })
  assert.deepEqual(reconciliationBadgeVisibility(false, false), {
    showEquals: false,
    showMismatch: false,
  })
})

test("reconciliationBadgeVisibility: after hydration mirrors billableEqualsMba", () => {
  assert.deepEqual(reconciliationBadgeVisibility(true, true), {
    showEquals: true,
    showMismatch: false,
  })
  assert.deepEqual(reconciliationBadgeVisibility(true, false), {
    showEquals: false,
    showMismatch: true,
  })
})

test("isSaveAllowedAfterHydration: denied until hydrated", () => {
  assert.equal(isSaveAllowedAfterHydration(false), false)
  assert.equal(isSaveAllowedAfterHydration(true), true)
})
