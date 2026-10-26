import assert from "node:assert/strict"
import test from "node:test"

import { fetchMetaPageIdForClient } from "../metaPageId"
import { resolveMetaPageIdForClient } from "../metaPageIdServer"

function okJson(body: unknown) {
  return async () => ({ ok: true, json: async () => body })
}

test("fetchMetaPageIdForClient uses the meta_page account from the platform accounts route", async () => {
  const calls: string[] = []
  const id = await fetchMetaPageIdForClient(18, "Curatif", async (url) => {
    calls.push(url)
    return okJson({ accounts: [{ platform: "meta_page", accountRef: "1122334455", active: true }] })()
  })
  assert.equal(id, "1122334455")
  assert.deepEqual(calls, ["/api/clients/18/platform-accounts"])
})

test("fetchMetaPageIdForClient falls back to legacy idmeta on no account, 503, a throw or no id", async () => {
  assert.equal(await fetchMetaPageIdForClient(18, " 555 ", okJson({ accounts: [] })), "555")
  assert.equal(
    await fetchMetaPageIdForClient(18, "555", async () => ({ ok: false, json: async () => ({}) })),
    "555",
  )
  assert.equal(
    await fetchMetaPageIdForClient(18, "555", async () => {
      throw new Error("network")
    }),
    "555",
  )
  let called = false
  const noId = await fetchMetaPageIdForClient(undefined, "777", async () => {
    called = true
    return okJson({ accounts: [] })()
  })
  assert.equal(noId, "777")
  assert.equal(called, false)
  assert.equal(await fetchMetaPageIdForClient(18, null, okJson({ accounts: "bad" })), "")
})

test("resolveMetaPageIdForClient reads platform accounts and falls back on error", async () => {
  const seen: number[] = []
  const list = (async (clientId: number) => {
    seen.push(clientId)
    return [
      {
        id: 1,
        clientId,
        platform: "meta_page",
        accountRef: "424242",
        label: null,
        active: true,
        createdAt: "2026-10-26T00:00:00Z",
        updatedAt: null,
      },
    ]
  }) as Parameters<typeof resolveMetaPageIdForClient>[2]
  assert.equal(await resolveMetaPageIdForClient(56, "TBC", list), "424242")
  assert.deepEqual(seen, [56])

  const failing = (async () => {
    throw new Error("relation does not exist")
  }) as Parameters<typeof resolveMetaPageIdForClient>[2]
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.equal(await resolveMetaPageIdForClient(56, " TBC ", failing), "TBC")
  } finally {
    console.warn = warn
  }
  assert.equal(await resolveMetaPageIdForClient(null, "123", list), "123")
  assert.deepEqual(seen, [56])
})
