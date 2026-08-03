import assert from "node:assert/strict"
import { describe, it, before } from "node:test"

/**
 * Instrument global fetch and exercise three real save*LineItems helpers
 * concurrently. Env must be set before importing lib/api.ts (module-level
 * getXanoBaseUrl).
 *
 * Reimplemented (not cherry-picked): save*LineItems now go through
 * replaceChannelLineItems, so the shared semaphore lives there.
 */
process.env["XANO_PUBLISHERS_BASE_URL"] ??= "https://example.test/publishers"
process.env["XANO_CLIENTS_BASE_URL"] ??= "https://example.test/clients"
process.env["XANO_MEDIA_DETAILS_BASE_URL"] ??= "https://example.test/media-details"
process.env["XANO_MEDIA_PLANS_BASE_URL"] ??= "https://example.test/media-plans"

describe("save*LineItems shared write concurrency", () => {
  let saveTelevisionLineItems: typeof import("@/lib/api").saveTelevisionLineItems
  let saveSearchLineItems: typeof import("@/lib/api").saveSearchLineItems
  let saveSocialMediaLineItems: typeof import("@/lib/api").saveSocialMediaLineItems
  let saveProductionLineItems: typeof import("@/lib/api").saveProductionLineItems

  before(async () => {
    const api = await import("@/lib/api")
    saveTelevisionLineItems = api.saveTelevisionLineItems
    saveSearchLineItems = api.saveSearchLineItems
    saveSocialMediaLineItems = api.saveSocialMediaLineItems
    saveProductionLineItems = api.saveProductionLineItems
  })

  it("keeps max in-flight POSTs <= 4 across channels including production", async () => {
    let inFlight = 0
    let maxInFlight = 0
    let posts = 0
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "POST") {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        posts++
        await new Promise((r) => setTimeout(r, 20))
        inFlight--
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        return new Response(JSON.stringify({ id: posts, ...body }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      // GET existing (empty) / DELETE
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    try {
      const makeItems = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          market: "National",
          creative: `c-${i}`,
          bursts: [{ startDate: "2026-01-01", endDate: "2026-01-31", budget: 100 }],
        }))

      const [tv, search, social, production] = await Promise.all([
        saveTelevisionLineItems(1, "MBA-T", "Client", "1", makeItems(8)),
        saveSearchLineItems(1, "MBA-T", "Client", "1", makeItems(8)),
        saveSocialMediaLineItems(1, "MBA-T", "Client", "1", makeItems(8)),
        saveProductionLineItems(1, "MBA-T", "Client", "1", makeItems(8)),
      ])

      assert.ok(maxInFlight <= 4, `expected maxInFlight <= 4, got ${maxInFlight}`)
      assert.equal(maxInFlight, 4)
      assert.equal(posts, 32)
      assert.equal(tv.length, 8)
      assert.equal(search.length, 8)
      assert.equal(social.length, 8)
      assert.equal(production.length, 8)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
