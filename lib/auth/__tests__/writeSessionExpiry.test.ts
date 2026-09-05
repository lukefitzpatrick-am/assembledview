import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  SESSION_EXPIRED_SAVE_MESSAGE,
  SESSION_EXPIRED_SKIPPED_STEP,
  SESSION_EXPIRED_TITLE,
  WriteSessionExpiredError,
  applySessionExpiredToSaveItems,
  isUnauthorizedStatus,
  isWriteSessionExpired,
  isWriteSessionExpiredError,
  noteAuthenticatedWriteOk,
  noteWriteUnauthorized,
  resetWriteSessionExpiryForTests,
  savingModalChromeForItems,
  throwIfWriteUnauthorized,
} from "@/lib/auth/writeSessionExpiry"

afterEach(() => {
  resetWriteSessionExpiryForTests()
})

describe("isUnauthorizedStatus", () => {
  it("is true only for 401", () => {
    assert.equal(isUnauthorizedStatus(401), true)
    assert.equal(isUnauthorizedStatus(403), false)
    assert.equal(isUnauthorizedStatus(500), false)
    assert.equal(isUnauthorizedStatus(200), false)
  })
})

describe("session-expired copy (AVA-VOICE)", () => {
  it("names the failure, that it is not the user's doing, and how to recover", () => {
    assert.equal(SESSION_EXPIRED_TITLE, "Session expired")
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /session expired/i)
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /did not go through|not written|nothing was written/i)
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /not something you did/i)
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /sign in again/i)
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /retry/i)
    assert.doesNotMatch(SESSION_EXPIRED_SAVE_MESSAGE, /unfortunately/i)
    assert.doesNotMatch(SESSION_EXPIRED_SAVE_MESSAGE, /401|unauthorised|middleware/i)
    assert.doesNotMatch(SESSION_EXPIRED_SAVE_MESSAGE, /!/)
  })
})

describe("write-session expiry store", () => {
  it("a 401 write sets the banner flag until a successful write", () => {
    assert.equal(isWriteSessionExpired(), false)
    noteWriteUnauthorized()
    assert.equal(isWriteSessionExpired(), true)
    noteAuthenticatedWriteOk()
    assert.equal(isWriteSessionExpired(), false)
  })

  it("survives a simulated re-login (sessionStorage round-trip)", () => {
    noteWriteUnauthorized()
    assert.equal(isWriteSessionExpired(), true)
    resetWriteSessionExpiryForTests({ hydrateFromStorage: true })
    assert.equal(isWriteSessionExpired(), true)
    noteAuthenticatedWriteOk()
    resetWriteSessionExpiryForTests({ hydrateFromStorage: true })
    assert.equal(isWriteSessionExpired(), false)
  })
})

describe("applySessionExpiredToSaveItems", () => {
  it("marks the failed step with the blocking copy and stops sibling spinners", () => {
    const next = applySessionExpiredToSaveItems(
      [
        { name: "Save plan (transactional)", status: "pending" },
        { name: "KPI sync", status: "pending" },
      ],
      "Save plan (transactional)"
    )
    assert.deepEqual(next, [
      {
        name: "Save plan (transactional)",
        status: "error",
        error: SESSION_EXPIRED_SAVE_MESSAGE,
      },
      {
        name: "KPI sync",
        status: "skipped",
        error: SESSION_EXPIRED_SKIPPED_STEP,
      },
    ])
  })
})

describe("savingModalChromeForItems", () => {
  it("uses the session-expired title and copy instead of a generic save failure", () => {
    const chrome = savingModalChromeForItems([
      {
        name: "Save plan (transactional)",
        status: "error",
        error: SESSION_EXPIRED_SAVE_MESSAGE,
      },
    ])
    assert.equal(chrome.titleWithErrors, SESSION_EXPIRED_TITLE)
    assert.equal(chrome.descriptionError, SESSION_EXPIRED_SAVE_MESSAGE)
  })

  it("leaves generic chrome for other save errors", () => {
    const chrome = savingModalChromeForItems([
      { name: "Save plan (transactional)", status: "error", error: "Duplicate line_item_id" },
    ])
    assert.equal(chrome.titleWithErrors, undefined)
    assert.equal(chrome.descriptionError, undefined)
  })
})

describe("WriteSessionExpiredError", () => {
  it("is distinguishable from a generic Error so create does not overlay a second toast", () => {
    const err = new WriteSessionExpiredError()
    assert.equal(err.message, SESSION_EXPIRED_SAVE_MESSAGE)
    assert.equal(isWriteSessionExpiredError(err), true)
    assert.equal(isWriteSessionExpiredError(new Error("unauthorised")), false)
  })
})

describe("throwIfWriteUnauthorized", () => {
  it("throws WriteSessionExpiredError and notes the banner on 401", () => {
    assert.equal(throwIfWriteUnauthorized(200), false)
    assert.equal(isWriteSessionExpired(), false)
    assert.throws(
      () => throwIfWriteUnauthorized(401),
      (err: unknown) => isWriteSessionExpiredError(err)
    )
    assert.equal(isWriteSessionExpired(), true)
  })
})
