/**
 * C-200 (B51): `codexGet`, the one way code outside Tasks reaches the Codex
 * API, only ever sends a GET to /api/codex/.
 */
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { codexGet } from "../readFetch"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function captureFetch(): Array<[string, RequestInit | undefined]> {
  const calls: Array<[string, RequestInit | undefined]> = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push([url, init])
    return new Response("{}")
  }) as typeof fetch
  return calls
}

test("codexGet sends a GET to /api/codex/ with the caller's options", async () => {
  const calls = captureFetch()
  await codexGet("tasks?mba_number=jayco001&per_page=10", { credentials: "include", cache: "no-store" })
  assert.deepEqual(calls, [
    ["/api/codex/tasks?mba_number=jayco001&per_page=10", { credentials: "include", cache: "no-store", method: "GET", body: null }],
  ])
})

test("a method or body slipped past the type is still a GET with no body", async () => {
  const calls = captureFetch()
  await codexGet("time/summary?mba=X", { method: "POST", body: "{}" } as unknown as RequestInit)
  assert.equal(calls[0][1]?.method, "GET")
  assert.equal(calls[0][1]?.body, null)
})
