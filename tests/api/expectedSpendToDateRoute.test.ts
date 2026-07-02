import assert from "node:assert/strict"
import test from "node:test"

import { GET } from "@/app/api/mediaplans/mba/[mba_number]/expected-spend-to-date/route"

test("expected-spend-to-date rejects invalid MBA before fetch", async () => {
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    fetchCalled = true
    return originalFetch(...args)
  }) as typeof fetch

  try {
    const request = new Request(
      "http://localhost:3000/api/mediaplans/mba/evil%40host/expected-spend-to-date"
    )
    const response = await GET(request, {
      params: Promise.resolve({ mba_number: "evil@host" }),
    })

    assert.equal(response.status, 400)
    assert.equal(fetchCalled, false)
    const body = (await response.json()) as { error?: string }
    assert.match(body.error ?? "", /Invalid MBA number/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})
