/**
 * B33 (B32 review N2): the partner-file query runs beside the CM360 query,
 * not after it. Failure policy is unchanged: either query rejecting fails the
 * whole fetch (an outage is not "no delivery"). A book with no Channel
 * Factory Digital Video line still makes one query.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

type Call = { channel: string; lineItemIds: string[]; startDate: string; endDate: string }
const calls: Call[] = []
let planRows: Array<Record<string, unknown>> = []
let fail: string | null = null
/** B34: every query rejects. */
let failAll = false
let gate: Promise<void> | null = null

function plan(lineItemId: string, extra: Record<string, unknown> = {}) {
  return {
    mbaNumber: "B33TEST001",
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemId,
    clientName: "Acme",
    campaignName: "Flight",
    campaignStatus: "booked",
    campaignStartDate: "2026-10-20",
    campaignEndDate: "2026-12-24",
    platform: "",
    buyType: "cpm",
    channelFamily: "digitalVideo",
    lineItemStartDate: "2026-10-20",
    lineItemEndDate: "2026-12-24",
    lineItemStatus: "no-data",
    impressions: 0,
    clicks: 0,
    ctr: null,
    videoCompletes: 0,
    results: 0,
    daysActive: 0,
    deliverableProgress: null,
    deliverableActual: 0,
    deliverableTarget: 1000,
    deliverableKind: "impressions",
    ...extra,
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/ad-serving/resolveLiveAdServingLineItems", {
    namedExports: {
      resolveLiveAdServingPacingCampaignRows: async () => structuredClone(planRows),
    },
  })
  await mock.module!("@/lib/snowflake/pacing-fact", {
    namedExports: {
      queryPacingFact: async (params: Call) => {
        calls.push({ ...params, lineItemIds: [...params.lineItemIds] })
        if (gate) await gate
        if (failAll || params.channel === fail) throw new Error(`${params.channel} down`)
        return params.lineItemIds.map((id) => ({
          CHANNEL: params.channel,
          LINE_ITEM_ID: id,
          DATE_DAY: "2026-10-21",
          IMPRESSIONS: params.channel === "ad-serving" ? 10 : 1000,
          CLICKS: 0,
          RESULTS: 0,
          VIDEO_3S_VIEWS: params.channel === "ad-serving" ? 0 : 700,
        }))
      },
    },
  })
}

const ARGS = { asOfDate: "2026-11-10", countToDate: "2026-11-09", allowedClientSlugs: null }

function deferred(): { promise: Promise<void>; release: () => void } {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.error = original
  }
}

test("B33: both queries are in flight before either returns", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("trwico001dv2", { publisher: "Channel Factory" }), plan("a1dd1", { channelFamily: "digitalDisplay" })]
  calls.length = 0
  const held = deferred()
  gate = held.promise
  try {
    const pending = fetchAdServingPacingCampaignRows(ARGS)
    // Let the resolver and the query calls run; neither query has returned yet.
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(calls.map((c) => c.channel), ["ad-serving", "programmatic-video"])
    assert.deepEqual(calls[0]!.lineItemIds, ["trwico001dv2", "a1dd1"])
    assert.deepEqual(calls[1]!.lineItemIds, ["trwico001dv2"])
    held.release()
    const rows = await pending
    const cf = rows.find((row) => row.lineItemId === "trwico001dv2")
    assert.equal(cf?.deliverySource, "partner_file_and_cm360")
    assert.equal(cf?.impressions, 1010)
    assert.equal(rows.find((row) => row.lineItemId === "a1dd1")?.deliverySource, undefined)
  } finally {
    gate = null
  }
})

test("B33: no Channel Factory line → still exactly one query", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("a1dv1", { platform: "Channel Factory" })]
  calls.length = 0
  const rows = await fetchAdServingPacingCampaignRows(ARGS)
  assert.deepEqual(calls.map((c) => c.channel), ["ad-serving"])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.deliverySource, undefined)
})

test("B33: a failed CM360 query fails the fetch even when the partner query succeeds", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("trwico001dv2", { publisher: "Channel Factory" })]
  calls.length = 0
  fail = "ad-serving"
  try {
    await quiet(() => assert.rejects(fetchAdServingPacingCampaignRows(ARGS), /ad-serving down/))
  } finally {
    fail = null
  }
})

test("B33: a failed partner query fails the fetch even when the CM360 query succeeds", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("trwico001dv2", { publisher: "Channel Factory" })]
  calls.length = 0
  fail = "programmatic-video"
  try {
    await quiet(() => assert.rejects(fetchAdServingPacingCampaignRows(ARGS), /programmatic-video down/))
  } finally {
    fail = null
  }
})

test("B33: a failed CM360 query fails the fetch with no Channel Factory line", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("a1dd1", { channelFamily: "digitalDisplay" })]
  calls.length = 0
  fail = "ad-serving"
  try {
    await quiet(() => assert.rejects(fetchAdServingPacingCampaignRows(ARGS), /ad-serving down/))
    assert.deepEqual(calls.map((c) => c.channel), ["ad-serving"])
  } finally {
    fail = null
  }
})

test("B33: the failure is logged once with the same fields", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("trwico001dv2", { publisher: "Channel Factory" }), plan("a1dd1", { channelFamily: "digitalDisplay" })]
  calls.length = 0
  fail = "programmatic-video"
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    logged.push(args)
  }
  try {
    await assert.rejects(fetchAdServingPacingCampaignRows(ARGS), /programmatic-video down/)
  } finally {
    console.error = original
    fail = null
  }
  assert.equal(logged.length, 1)
  assert.equal(logged[0]![0], "[fetchAdServingPacingCampaignRows] Snowflake query failed")
  const detail = logged[0]![1] as Record<string, unknown>
  assert.deepEqual(Object.keys(detail), ["lineItemCount", "partnerLineItemCount", "startDate", "endDate", "err"])
  assert.equal(detail.lineItemCount, 2)
  assert.equal(detail.partnerLineItemCount, 1)
  assert.equal(detail.startDate, "2026-10-20")
  assert.equal(detail.endDate, "2026-11-09")
})

test("B34: both queries failing at once fails the fetch once, logs once, leaves no unhandled rejection", { skip }, async () => {
  const { fetchAdServingPacingCampaignRows } = await import("../fetchAdServingPacingCampaignRows.js")
  planRows = [plan("trwico001dv2", { publisher: "Channel Factory" }), plan("a1dd1", { channelFamily: "digitalDisplay" })]
  calls.length = 0
  failAll = true
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason)
  }
  process.on("unhandledRejection", onUnhandled)
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    logged.push(args)
  }
  try {
    // Promise.all rejects with the first rejection: the CM360 query starts first.
    await assert.rejects(fetchAdServingPacingCampaignRows(ARGS), /ad-serving down/)
    await new Promise((resolve) => setImmediate(resolve))
  } finally {
    console.error = original
    process.off("unhandledRejection", onUnhandled)
    failAll = false
  }
  assert.deepEqual(calls.map((c) => c.channel), ["ad-serving", "programmatic-video"])
  assert.equal(logged.length, 1)
  assert.equal(logged[0]![0], "[fetchAdServingPacingCampaignRows] Snowflake query failed")
  assert.deepEqual(unhandled, [])
})
