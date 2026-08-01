/**
 * DEDUPE-2 — media-details reference GETs coalesce via coalescedGetJson.
 */
import assert from "node:assert/strict"
import test, { afterEach, beforeEach } from "node:test"

import "@/lib/mediaplan/__tests__/testXanoEnv"
import { clearCoalescedGetJsonForTests } from "@/lib/api/coalescedGetJson"

const { fetchMediaDetailBrowser, mediaDetailsBrowserUrl } = await import("@/lib/api")

const originalFetch = globalThis.fetch
let fetchCalls: string[] = []

beforeEach(() => {
  clearCoalescedGetJsonForTests()
  fetchCalls = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCalls.push(url)
    return new Response(
      JSON.stringify([{ id: 1, title: "Wired", network: "Conde" }]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  clearCoalescedGetJsonForTests()
})

test("two concurrent fetchMediaDetailBrowser → one network GET", async () => {
  const [a, b] = await Promise.all([
    fetchMediaDetailBrowser("magazines"),
    fetchMediaDetailBrowser("magazines"),
  ])
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0], mediaDetailsBrowserUrl("magazines"))
  assert.deepEqual(a, b)
})

test("magazines_adsizes and display_site each coalesce independently", async () => {
  await Promise.all([
    fetchMediaDetailBrowser("magazines_adsizes"),
    fetchMediaDetailBrowser("magazines_adsizes"),
    fetchMediaDetailBrowser("display_site"),
    fetchMediaDetailBrowser("display_site"),
  ])
  assert.equal(fetchCalls.length, 2)
  assert.ok(fetchCalls.includes(mediaDetailsBrowserUrl("magazines_adsizes")))
  assert.ok(fetchCalls.includes(mediaDetailsBrowserUrl("display_site")))
})

test("session TTL: sequential callers share one GET", async () => {
  await fetchMediaDetailBrowser("magazines")
  await fetchMediaDetailBrowser("magazines")
  assert.equal(fetchCalls.length, 1)
})
