import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { localDraftStorageKey } from "../localStore.js"

describe("local draft key — re-login survival (existing mechanism, not a new store)", () => {
  it("same userId + masterId reads the same IndexedDB key after a simulated re-login", () => {
    const before = localDraftStorageKey({
      masterId: 283,
      mbaNumber: "krusty014",
      userId: "auth0|abc",
    })
    const after = localDraftStorageKey({
      masterId: 283,
      mbaNumber: "krusty014",
      userId: "auth0|abc",
    })
    assert.equal(before, "m283::auth0|abc")
    assert.equal(after, before)
  })

  it("create-page drafts key on MBA + userId (case-insensitive MBA)", () => {
    assert.equal(
      localDraftStorageKey({
        masterId: null,
        mbaNumber: "krusty014",
        userId: "u1",
      }),
      localDraftStorageKey({
        masterId: null,
        mbaNumber: "KRUSTY014",
        userId: "u1",
      })
    )
    assert.equal(
      localDraftStorageKey({
        masterId: null,
        mbaNumber: "krusty014",
        userId: "u1",
      }),
      "mba:KRUSTY014::u1"
    )
  })

  it("a different userId after login cannot see the previous user's local draft", () => {
    const a = localDraftStorageKey({
      masterId: 1,
      mbaNumber: "x",
      userId: "auth0|a",
    })
    const b = localDraftStorageKey({
      masterId: 1,
      mbaNumber: "x",
      userId: "auth0|b",
    })
    assert.notEqual(a, b)
  })
})
