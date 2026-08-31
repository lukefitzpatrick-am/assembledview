/**
 * CS-B2 — status persist must wait for a media_plan_masters row, not an MBA
 * number. The create page mints mba_number client-side before any master exists
 * (glenda009). A truthy MBA used to skip local-hold and PATCH a missing row.
 */
import assert from "node:assert/strict"
import { afterEach, describe, it, mock } from "node:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { persistCampaignStatus } from "@/components/campaign/CampaignStatusControl"
import {
  SELECTABLE_CAMPAIGN_STATUSES,
} from "@/lib/mediaplan/campaignStatusGuard"
import { resolveCampaignPhase } from "@/lib/mediaplan/campaignPhase"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const CONTROL = join(ROOT, "components/campaign/CampaignStatusControl.tsx")

afterEach(() => {
  mock.restoreAll()
})

describe("CS-B2 persist() local-hold vs PATCH", () => {
  it("persisted=false with a client-generated MBA does not fetch and does call onStatusCommitted", async () => {
    const fetchMock = mock.fn(async () => {
      throw new Error("fetch must not run on local-hold")
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const committed: string[] = []
    try {
      await persistCampaignStatus({
        next: "approved",
        persisted: false,
        mbaNumber: "glenda009",
        onStatusCommitted: (status) => committed.push(status),
      })
    } finally {
      globalThis.fetch = originalFetch
    }
    assert.deepEqual(committed, ["approved"])
    assert.equal(fetchMock.mock.calls.length, 0)
  })

  it("persisted=true issues PATCH /api/mediaplans/mba/:mba/status as today", async () => {
    const fetchMock = mock.fn(async (input: unknown, init?: RequestInit) => {
      assert.equal(typeof input, "string")
      assert.equal(
        input,
        "/api/mediaplans/mba/glenda009/status"
      )
      assert.equal(init?.method, "PATCH")
      assert.equal(init?.body, JSON.stringify({ status: "booked" }))
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      }
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const committed: string[] = []
    try {
      await persistCampaignStatus({
        next: "booked",
        persisted: true,
        mbaNumber: "glenda009",
        onStatusCommitted: (status) => committed.push(status),
      })
    } finally {
      globalThis.fetch = originalFetch
    }
    assert.equal(fetchMock.mock.calls.length, 1)
    assert.deepEqual(committed, ["booked"])
  })

  it("persisted=true with a blank MBA still local-holds (no fetch)", async () => {
    const fetchMock = mock.fn(async () => {
      throw new Error("fetch must not run without an MBA")
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const committed: string[] = []
    try {
      await persistCampaignStatus({
        next: "planned",
        persisted: true,
        mbaNumber: "  ",
        onStatusCommitted: (status) => committed.push(status),
      })
    } finally {
      globalThis.fetch = originalFetch
    }
    assert.deepEqual(committed, ["planned"])
    assert.equal(fetchMock.mock.calls.length, 0)
  })
})

describe("CS-B2 derived Live must not gate the selector", () => {
  it("approved dates in range are Live display, but the control still lists all four selectable statuses and does not disable from phase", () => {
    const phase = resolveCampaignPhase({
      status: "approved",
      startDate: "2026-03-10",
      endDate: "2026-03-20",
      today: new Date("2026-03-15T02:00:00.000Z"),
    })
    assert.equal(phase.phase, "live")
    assert.equal(phase.derived, true)

    const src = readFileSync(CONTROL, "utf8")
    assert.match(src, /options=\{SELECTABLE_OPTIONS\}/)
    assert.match(src, /disabled=\{disabled \|\| pending\}/)
    assert.doesNotMatch(src, /disabled=\{disabled \|\| pending \|\|/)
    assert.doesNotMatch(src, /phase\.(phase|derived).*disabled/)
    assert.deepEqual([...SELECTABLE_CAMPAIGN_STATUSES], [
      "planned",
      "approved",
      "booked",
      "cancelled",
    ])
    assert.match(src, /SELECTABLE_OPTIONS = SELECTABLE_CAMPAIGN_STATUSES\.map/)
  })
})
