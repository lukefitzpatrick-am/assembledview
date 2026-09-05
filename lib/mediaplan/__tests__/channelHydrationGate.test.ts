import assert from "node:assert/strict"
import test from "node:test"

import {
  buildHydrationToastItems,
  computeAllChannelsHydrated,
  formatHydrationToastHeader,
  formatSaveHydrationHoldReason,
  hydrationToastReadyCount,
  isSaveAllowedAfterHydration,
  lineItemLoadToastAfterChannelSuccess,
  listOutstandingHydrationChannels,
  mediaLoadStatusAfterChannelSuccess,
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

test("computeAllChannelsHydrated: newly toggled channel with undefined/idle status blocks Save", () => {
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: ["mp_search", "mp_radio"],
      mediaLoadStatus: { mp_search: "ready" },
      settledFlags: { mp_search: true },
    }),
    false
  )
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: ["mp_search", "mp_radio"],
      mediaLoadStatus: { mp_search: "ready", mp_radio: "idle" },
      settledFlags: { mp_search: true },
    }),
    false
  )
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: ["mp_search", "mp_radio"],
      mediaLoadStatus: { mp_search: "ready", mp_radio: "ready" },
      settledFlags: { mp_search: true, mp_radio: true },
    }),
    true
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

test("listOutstandingHydrationChannels: names the unsettled channel", () => {
  const outstanding = listOutstandingHydrationChannels({
    loadPhase: "ready",
    expectedFlags: ["mp_search", "mp_socialmedia"],
    mediaLoadStatus: { mp_search: "ready", mp_socialmedia: "loading" },
    settledFlags: { mp_search: true },
  })
  assert.deepEqual(outstanding, ["Social"])
})

test("formatSaveHydrationHoldReason: single channel vs count", () => {
  assert.equal(
    formatSaveHydrationHoldReason(["Social"]),
    "Waiting for Social to load — you can't save yet"
  )
  assert.equal(
    formatSaveHydrationHoldReason(["Social", "Search"]),
    "Waiting for 2 channels to load — you can't save yet"
  )
  assert.equal(formatSaveHydrationHoldReason([]), null)
})

test("late success after watchdog: clears mediaLoadStatus error → ready", () => {
  const afterWatchdog = {
    mp_search: "ready" as const,
    mp_television: "error" as const,
  }
  const afterSuccess = mediaLoadStatusAfterChannelSuccess(afterWatchdog, "mp_television")
  assert.equal(afterSuccess.mp_television, "ready")
  assert.equal(afterSuccess.mp_search, "ready")
  // Gate treats ready+settled as hydrated (no stale error block on loaded data).
  assert.equal(
    computeAllChannelsHydrated({
      loadPhase: "ready",
      expectedFlags: ["mp_search", "mp_television"],
      mediaLoadStatus: afterSuccess,
      settledFlags: { mp_search: true, mp_television: true },
    }),
    true
  )
})

test("late success after watchdog: clears load-toast error text for that channel", () => {
  const afterWatchdog = [
    { name: "Search", status: "success" as const },
    {
      name: "Television",
      status: "error" as const,
      error: "did not finish loading — check line items before saving",
    },
  ]
  const afterSuccess = lineItemLoadToastAfterChannelSuccess(afterWatchdog, "Television")
  assert.deepEqual(afterSuccess, [
    { name: "Search", status: "success" },
    { name: "Television", status: "success" },
  ])
  assert.equal(
    afterSuccess.find((i) => i.name === "Television")?.error,
    undefined
  )
  assert.equal(
    afterSuccess.some((i) => i.status === "error"),
    false
  )
})

const toastInputReadyUnsettled = {
  loadPhase: "ready" as const,
  expectedFlags: ["mp_search", "mp_socialmedia"],
  mediaLoadStatus: { mp_search: "ready" as const, mp_socialmedia: "ready" as const },
  settledFlags: { mp_search: true },
}

test("hydration toast m is expectedFlags only — no Campaign details row", () => {
  const items = buildHydrationToastItems({
    loadPhase: "ready",
    expectedFlags: ["mp_search", "mp_television"],
    mediaLoadStatus: { mp_search: "ready" as const, mp_television: "ready" as const },
    settledFlags: { mp_search: true, mp_television: true },
  })
  assert.equal(items.length, 2)
  assert.equal(
    items.some((item) => item.name === "Campaign details"),
    false
  )
  assert.deepEqual(
    items.map((item) => item.flag),
    ["mp_search", "mp_television"]
  )
})

test("hydration toast stays pending until container settle — fetch ready is not enough", () => {
  const items = buildHydrationToastItems(toastInputReadyUnsettled)
  assert.equal(items.find((item) => item.flag === "mp_search")?.status, "success")
  assert.equal(items.find((item) => item.flag === "mp_socialmedia")?.status, "pending")
  assert.equal(hydrationToastReadyCount(items), 1)
  assert.equal(computeAllChannelsHydrated(toastInputReadyUnsettled), false)
})

test("hydration toast ready count matches the save gate, including error", () => {
  const input = {
    loadPhase: "ready" as const,
    expectedFlags: ["mp_search", "mp_television"],
    mediaLoadStatus: { mp_search: "ready" as const, mp_television: "error" as const },
    settledFlags: { mp_search: true },
  }
  const items = buildHydrationToastItems(input)
  assert.equal(hydrationToastReadyCount(items), 2)
  assert.equal(computeAllChannelsHydrated(input), true)
  assert.equal(isSaveAllowedAfterHydration(computeAllChannelsHydrated(input)), true)
})

test("hydration toast header names outstanding hangers", () => {
  const items = buildHydrationToastItems(toastInputReadyUnsettled)
  const hangLabels = items
    .filter((item) => item.status === "pending")
    .map((item) => item.name)
  assert.deepEqual(hangLabels, ["Social"])
  assert.equal(
    formatHydrationToastHeader({
      readyCount: hydrationToastReadyCount(items),
      totalCount: items.length,
      hangLabels,
    }),
    "1 of 2 containers ready — still waiting on Social"
  )
})

test("hydration toast header bootstrapping copy when no containers yet", () => {
  assert.equal(
    formatHydrationToastHeader({
      readyCount: 0,
      totalCount: 0,
      hangLabels: [],
      bootstrapping: true,
    }),
    "Loading campaign details…"
  )
})
