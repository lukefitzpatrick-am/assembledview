/**
 * DEDUPE-1 — approvals GET coalesces via coalescedGetJson; PATCH invalidates.
 */
import assert from "node:assert/strict"
import test, { afterEach, beforeEach } from "node:test"

import { clearCoalescedGetJsonForTests } from "@/lib/api/coalescedGetJson"
import {
  fetchMbaLineApprovalsClient,
  mbaLineApprovalsGetUrl,
  patchMbaLineApprovalsClient,
} from "../mbaLineApprovalsClient"

const originalFetch = globalThis.fetch
let fetchCalls: Array<{ url: string; method: string }> = []
let getBodies: Array<{ status: number; body: unknown }> = []
let patchStatus = 200

beforeEach(() => {
  clearCoalescedGetJsonForTests()
  fetchCalls = []
  getBodies = [
    {
      status: 200,
      body: {
        available: true,
        lines: [
          {
            line_item_id: "billing-search::A1",
            media_type: "search",
            approved: false,
          },
        ],
      },
    },
  ]
  patchStatus = 200
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    fetchCalls.push({ url, method })
    if (method === "PATCH") {
      return new Response(JSON.stringify({ ok: true }), {
        status: patchStatus,
        headers: { "Content-Type": "application/json" },
      })
    }
    const next = getBodies.shift() ?? {
      status: 200,
      body: { available: true, lines: [] },
    }
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  clearCoalescedGetJsonForTests()
})

test("five concurrent fetchMbaLineApprovalsClient → one network GET", async () => {
  const params = { mbaNumber: "PENFOLD013", mediaPlanVersion: 4 }
  const results = await Promise.all([
    fetchMbaLineApprovalsClient(params),
    fetchMbaLineApprovalsClient(params),
    fetchMbaLineApprovalsClient(params),
    fetchMbaLineApprovalsClient(params),
    fetchMbaLineApprovalsClient(params),
  ])

  const gets = fetchCalls.filter((c) => c.method === "GET")
  assert.equal(gets.length, 1)
  assert.equal(
    gets[0]?.url,
    mbaLineApprovalsGetUrl("PENFOLD013", 4)
  )
  for (const r of results) {
    assert.equal(r.ok, true)
    if (r.ok && r.available) {
      assert.equal(r.rows.length, 1)
      assert.equal(r.rows[0]?.line_item_id, "billing-search::A1")
    }
  }
})

test("TTL cache: sequential fetches within window share one GET", async () => {
  const params = { mbaNumber: "PENFOLD013", mediaPlanVersion: 4 }
  const a = await fetchMbaLineApprovalsClient(params)
  const b = await fetchMbaLineApprovalsClient(params)
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.equal(fetchCalls.filter((c) => c.method === "GET").length, 1)
})

test("successful PATCH invalidates GET cache so next fetch hits network", async () => {
  const params = { mbaNumber: "PENFOLD013", mediaPlanVersion: 4 }
  const first = await fetchMbaLineApprovalsClient(params)
  assert.equal(first.ok, true)
  assert.equal(fetchCalls.filter((c) => c.method === "GET").length, 1)

  getBodies.push({
    status: 200,
    body: {
      available: true,
      lines: [
        {
          line_item_id: "billing-search::B2",
          media_type: "search",
          approved: false,
        },
      ],
    },
  })

  const patch = await patchMbaLineApprovalsClient({
    ...params,
    lines: [
      {
        line_item_id: "billing-search::A1",
        media_type: "search",
        approved: true,
      },
    ],
  })
  assert.equal(patch.ok, true)

  const second = await fetchMbaLineApprovalsClient(params)
  assert.equal(second.ok, true)
  assert.equal(fetchCalls.filter((c) => c.method === "GET").length, 2)
  if (second.ok && second.available) {
    assert.equal(second.rows[0]?.line_item_id, "billing-search::B2")
  }
})

test("failed PATCH does not invalidate GET cache", async () => {
  const params = { mbaNumber: "PENFOLD013", mediaPlanVersion: 4 }
  await fetchMbaLineApprovalsClient(params)
  patchStatus = 500
  const patch = await patchMbaLineApprovalsClient({
    ...params,
    lines: [
      {
        line_item_id: "billing-search::A1",
        media_type: "search",
        approved: false,
      },
    ],
  })
  assert.equal(patch.ok, false)
  await fetchMbaLineApprovalsClient(params)
  assert.equal(fetchCalls.filter((c) => c.method === "GET").length, 1)
})
