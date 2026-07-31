import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { LineChannel } from "@/db/schema"
import {
  mirrorPlanToXano,
  savePlanLineItemToSaverInput,
  type MirrorChannelSaver,
  type MirrorPlanToXanoInput,
} from "@/lib/data/mirrorToXano"
import { LINE_ITEM_WRITE_CONCURRENCY } from "@/lib/utils/createSemaphore"
import {
  replaceChannelLineItems,
  withInsertBeforeDelete,
} from "@/lib/api/replaceChannelLineItems"

process.env.XANO_MEDIA_PLANS_BASE_URL ??= "https://example.test/media-plans"
process.env.XANO_PUBLISHERS_BASE_URL ??= "https://example.test/publishers"
process.env.XANO_CLIENTS_BASE_URL ??= "https://example.test/clients"
process.env.XANO_MEDIA_DETAILS_BASE_URL ??= "https://example.test/media-details"

function baseInput(
  overrides: Partial<MirrorPlanToXanoInput> = {}
): MirrorPlanToXanoInput {
  return {
    mbaNumber: "KRUSTY001",
    versionNumber: 1,
    versionId: 9001,
    clientName: "Krusty Krab",
    masterId: 42,
    campaignName: "Krusty Draft",
    campaignStatus: "Draft",
    lineItems: [
      {
        lineItemId: "KRUSTY001TV1",
        channel: "television",
        mediaType: "television",
        rate: 10,
        enteredAmount: 1000,
        bursts: [
          {
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            budget: 1000,
          },
        ],
        attrs: { network: "Nine" },
      },
      {
        lineItemId: "KRUSTY001PROD1",
        channel: "production",
        mediaType: "production",
        rate: 0,
        enteredAmount: 500,
        bursts: [
          {
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            cost: 500,
          },
        ],
        attrs: { media_type: "Editing", publisher: "In-house" },
      },
    ],
    ...overrides,
  }
}

describe("mirrorPlanToXano", () => {
  it("returns mirror:failed without throwing when a channel saver fails", async () => {
    const calls: string[] = []
    const boom: MirrorChannelSaver = async () => {
      calls.push("tv")
      throw new Error("Xano POST blocked")
    }
    const ok: MirrorChannelSaver = async () => {
      calls.push("other")
      return []
    }

    const result = await mirrorPlanToXano(baseInput(), {
      upsertVersion: async () => 9001,
      syncCampaignKpis: async () => [],
      saveByChannel: {
        television: boom,
        production: ok,
      },
    })

    assert.equal(result.mirror, "failed")
    assert.ok(result.error?.includes("Xano POST blocked"))
    assert.ok(result.durationMs >= 0)
    assert.ok(calls.includes("tv") || calls.includes("other"))
  })

  it("includes production channel in the fan-out", async () => {
    const touched: LineChannel[] = []
    const track =
      (channel: LineChannel): MirrorChannelSaver =>
      async (_vid, _mba, _client, _plan, items) => {
        touched.push(channel)
        return items
      }

    const result = await mirrorPlanToXano(baseInput(), {
      upsertVersion: async () => 9001,
      syncCampaignKpis: async () => [],
      saveByChannel: {
        television: track("television"),
        production: track("production"),
        search: track("search"),
      },
    })

    assert.equal(result.mirror, "ok")
    assert.ok(touched.includes("production"), `touched=${touched.join(",")}`)
    assert.ok(touched.includes("television"))
  })

  it("runs syncCampaignKpis after channel saves", async () => {
    const order: string[] = []
    const saver: MirrorChannelSaver = async () => {
      order.push("channel")
      return []
    }
    const result = await mirrorPlanToXano(
      baseInput({
        kpiRows: [
          {
            mba_number: "KRUSTY001",
            version_number: 1,
            line_item_id: "KRUSTY001TV1",
          } as any,
        ],
      }),
      {
        upsertVersion: async () => 9001,
        saveByChannel: { television: saver, production: saver },
        syncCampaignKpis: async () => {
          order.push("kpi")
          return []
        },
      }
    )
    assert.equal(result.mirror, "ok")
    assert.ok(order.indexOf("kpi") > order.indexOf("channel"))
  })

  it("savePlanLineItemToSaverInput preserves line_item_id and bursts", () => {
    const shaped = savePlanLineItemToSaverInput(baseInput().lineItems[0]!)
    assert.equal(shaped.line_item_id, "KRUSTY001TV1")
    assert.ok(Array.isArray(shaped.bursts))
  })

  it("O4.6: publish mode PATCHes Xano master watermark", async () => {
    const patchCalls: Array<{ versionNumber: number; campaignStatus?: string | null }> =
      []
    const result = await mirrorPlanToXano(
      baseInput({
        mode: "publish",
        versionNumber: 4,
        campaignStatus: "booked",
      }),
      {
        upsertVersion: async () => 9001,
        syncCampaignKpis: async () => [],
        saveByChannel: {
          television: async () => [],
          production: async () => [],
        },
        patchMaster: async (input) => {
          patchCalls.push({
            versionNumber: input.versionNumber,
            campaignStatus: input.campaignStatus,
          })
        },
      }
    )
    assert.equal(result.mirror, "ok")
    assert.equal(patchCalls.length, 1)
    assert.equal(patchCalls[0]?.versionNumber, 4)
    assert.equal(patchCalls[0]?.campaignStatus, "booked")
  })

  it("O4.6: draft mode does NOT PATCH Xano master", async () => {
    let patchCalls = 0
    const result = await mirrorPlanToXano(
      baseInput({ mode: "draft", versionNumber: 1 }),
      {
        upsertVersion: async () => 9001,
        syncCampaignKpis: async () => [],
        saveByChannel: {
          television: async () => [],
          production: async () => [],
        },
        patchMaster: async () => {
          patchCalls++
        },
      }
    )
    assert.equal(result.mirror, "ok")
    assert.equal(patchCalls, 0)
  })

  it("O4.6: master PATCH failure → mirror:failed, never throws", async () => {
    const result = await mirrorPlanToXano(
      baseInput({ mode: "publish", versionNumber: 3, campaignStatus: "booked" }),
      {
        upsertVersion: async () => 9001,
        syncCampaignKpis: async () => [],
        saveByChannel: {
          television: async () => [],
          production: async () => [],
        },
        patchMaster: async () => {
          throw new Error("Xano master PATCH blocked")
        },
      }
    )
    assert.equal(result.mirror, "failed")
    assert.ok(result.error?.includes("Xano master PATCH blocked"))
  })
})

describe("replaceChannelLineItems insert-before-delete + semaphore", () => {
  it("POSTs new rows before DELETEing snapshotted ids", async () => {
    const ops: string[] = []
    const originalFetch = globalThis.fetch
    const axios = (await import("axios")).default
    const originalGet = axios.get

    // listExistingRows uses fetchAllXanoPages → axios.get
    axios.get = (async () => {
      ops.push("GET")
      return {
        data: [{ id: 11, media_plan_version: 1, mba_number: "MBA" }],
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      }
    }) as typeof axios.get

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "POST") {
        ops.push("POST")
        return new Response(JSON.stringify({ id: 99 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (method === "DELETE") {
        ops.push(`DELETE:${url.split("/").pop()}`)
        return new Response(null, { status: 200 })
      }
      return new Response("[]", { status: 200 })
    }) as typeof fetch

    try {
      await withInsertBeforeDelete(async () => {
        await replaceChannelLineItems(
          "media_plan_television",
          1,
          [{ mba_number: "MBA", media_plan_version: 1 }],
          "MBA"
        )
      })
      assert.ok(ops.includes("GET"))
      const postIdx = ops.indexOf("POST")
      const delIdx = ops.findIndex((o) => o.startsWith("DELETE:"))
      assert.ok(postIdx >= 0, `ops=${ops.join(",")}`)
      assert.ok(delIdx >= 0, `ops=${ops.join(",")}`)
      assert.ok(postIdx < delIdx, `expected POST before DELETE, ops=${ops.join(",")}`)
      assert.equal(ops[delIdx], "DELETE:11")
    } finally {
      globalThis.fetch = originalFetch
      axios.get = originalGet
    }
  })

  it("caps concurrent POSTs at LINE_ITEM_WRITE_CONCURRENCY across channels", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "POST") {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 25))
        inFlight--
        return new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      // GET list / DELETE
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    try {
      const rows = Array.from({ length: 6 }, (_, i) => ({
        mba_number: "MBA",
        media_plan_version: 1,
        i,
      }))
      await Promise.all([
        replaceChannelLineItems("media_plan_television", 1, rows, "MBA"),
        replaceChannelLineItems("media_plan_search", 1, rows, "MBA"),
        replaceChannelLineItems("media_plan_production", 1, rows, "MBA"),
      ])
      assert.ok(
        maxInFlight <= LINE_ITEM_WRITE_CONCURRENCY,
        `maxInFlight=${maxInFlight} cap=${LINE_ITEM_WRITE_CONCURRENCY}`
      )
      assert.equal(maxInFlight, LINE_ITEM_WRITE_CONCURRENCY)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
