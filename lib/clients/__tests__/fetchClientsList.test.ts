/**
 * Fail-soft clients list — three response shapes every converted consumer must honour.
 */
import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  applyClientsFetchResult,
  CLIENTS_LIST_UNAVAILABLE_MESSAGE,
  CLIENTS_SERVED_STALE_WARNING,
  CLIENTS_UNAVAILABLE_WARNING,
  fetchClientsList,
} from "../fetchClientsList.js"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetch(res: {
  ok?: boolean
  status?: number
  body: unknown
  warning?: string | null
}) {
  globalThis.fetch = (async () => {
    const headers = new Headers()
    if (res.warning) headers.set("x-warning", res.warning)
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      headers,
      json: async () => res.body,
    } as Response
  }) as typeof fetch
}

describe("fetchClientsList", () => {
  it("200 + [] + x-warning: clients-unavailable → ok:false (not empty success)", async () => {
    mockFetch({ body: [], warning: CLIENTS_UNAVAILABLE_WARNING })
    const result = await fetchClientsList()
    assert.equal(result.ok, false)
    if (result.ok) throw new Error("unreachable")
    assert.equal(result.warning, CLIENTS_UNAVAILABLE_WARNING)
    assert.equal(result.message, CLIENTS_LIST_UNAVAILABLE_MESSAGE)
    assert.deepEqual(result.data, [])
    const ui = applyClientsFetchResult(result)
    assert.equal(ui.saveBlocked, true)
    assert.equal(ui.clientsError, CLIENTS_LIST_UNAVAILABLE_MESSAGE)
    assert.deepEqual(ui.clients, [])
  })

  it("200 + [] + NO warning → genuine empty, ok:true, save not blocked", async () => {
    mockFetch({ body: [], warning: null })
    const result = await fetchClientsList()
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error("unreachable")
    assert.deepEqual(result.data, [])
    assert.equal(result.warning, null)
    const ui = applyClientsFetchResult(result)
    assert.equal(ui.saveBlocked, false)
    assert.equal(ui.clientsError, null)
    assert.deepEqual(ui.clients, [])
  })

  it("200 + non-empty + served-stale-after-upstream-failure → ok:true with data", async () => {
    const rows = [{ id: 2, mp_client_name: "Acme" }]
    mockFetch({ body: rows, warning: CLIENTS_SERVED_STALE_WARNING })
    const result = await fetchClientsList<{ id: number; mp_client_name: string }>()
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error("unreachable")
    assert.deepEqual(result.data, rows)
    assert.equal(result.warning, CLIENTS_SERVED_STALE_WARNING)
    const ui = applyClientsFetchResult(result)
    assert.equal(ui.saveBlocked, false)
    assert.equal(ui.clientsError, null)
    assert.equal(ui.clients[0]?.mp_client_name, "Acme")
  })
})

/** Named contracts — same three shapes each converted consumer must wire. */
for (const consumer of [
  "mediaplans/create",
  "mediaplans/mba/edit",
  "admin/users/new",
  "scopes-of-work/create",
  "scopes-of-work/edit",
] as const) {
  describe(`clients fail-soft gate — ${consumer}`, () => {
    it("unavailable → error + save blocked", async () => {
      mockFetch({ body: [], warning: CLIENTS_UNAVAILABLE_WARNING })
      const ui = applyClientsFetchResult(await fetchClientsList())
      assert.equal(ui.saveBlocked, true)
      assert.ok(ui.clientsError)
    })

    it("genuine empty → no error, save not blocked", async () => {
      mockFetch({ body: [], warning: null })
      const ui = applyClientsFetchResult(await fetchClientsList())
      assert.equal(ui.saveBlocked, false)
      assert.equal(ui.clientsError, null)
      assert.deepEqual(ui.clients, [])
    })

    it("stale non-empty → success with data", async () => {
      mockFetch({
        body: [{ id: 3, mp_client_name: "Birch" }],
        warning: CLIENTS_SERVED_STALE_WARNING,
      })
      const ui = applyClientsFetchResult(await fetchClientsList())
      assert.equal(ui.saveBlocked, false)
      assert.equal(ui.clients.length, 1)
    })
  })
}
