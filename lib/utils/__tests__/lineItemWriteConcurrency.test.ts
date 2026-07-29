import assert from "node:assert/strict"
import { describe, it, before } from "node:test"

/**
 * Instrument global fetch and exercise three real save*LineItems helpers
 * concurrently. Env must be set before importing lib/api.ts (module-level
 * getXanoBaseUrl).
 */
process.env.XANO_PUBLISHERS_BASE_URL ??= "https://example.test/publishers"
process.env.XANO_CLIENTS_BASE_URL ??= "https://example.test/clients"
process.env.XANO_MEDIA_DETAILS_BASE_URL ??= "https://example.test/media-details"
process.env.XANO_MEDIA_PLANS_BASE_URL ??= "https://example.test/media-plans"

describe("save*LineItems shared write concurrency", () => {
  let saveTelevisionLineItems: typeof import("@/lib/api").saveTelevisionLineItems
  let saveSearchLineItems: typeof import("@/lib/api").saveSearchLineItems
  let saveSocialMediaLineItems: typeof import("@/lib/api").saveSocialMediaLineItems

  before(async () => {
    const api = await import("@/lib/api")
    saveTelevisionLineItems = api.saveTelevisionLineItems
    saveSearchLineItems = api.saveSearchLineItems
    saveSocialMediaLineItems = api.saveSocialMediaLineItems
  })

  it("keeps max in-flight POSTs <= 4 across 3 channels × 10 lines", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const posts: string[] = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "POST") {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        posts.push(String(input))
        await new Promise((r) => setTimeout(r, 20))
        inFlight--
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        return new Response(JSON.stringify({ id: posts.length, ...body }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const makeItems = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          market: "National",
          creative: `c-${i}`,
          bursts: [{ startDate: "2026-01-01", endDate: "2026-01-31", budget: 100 }],
        }))

      const [tv, search, social] = await Promise.all([
        saveTelevisionLineItems(1, "MBA-T", "Client", "1", makeItems(10)),
        saveSearchLineItems(1, "MBA-T", "Client", "1", makeItems(10)),
        saveSocialMediaLineItems(1, "MBA-T", "Client", "1", makeItems(10)),
      ])

      assert.ok(maxInFlight <= 4, `expected maxInFlight <= 4, got ${maxInFlight}`)
      assert.equal(maxInFlight, 4)
      assert.equal(posts.length, 30)
      assert.equal(tv.length, 10)
      assert.equal(search.length, 10)
      assert.equal(social.length, 10)
      // Order preserved per channel (index-aligned results)
      for (let i = 0; i < 10; i++) {
        assert.equal(tv[i].mba_number, "MBA-T")
        assert.equal(search[i].mba_number, "MBA-T")
        assert.equal(social[i].mba_number, "MBA-T")
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
