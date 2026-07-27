import assert from "node:assert/strict"
import { describe, it, mock, afterEach } from "node:test"
import {
  fetchBillingOverridesClient,
  isUsableBillingVersionId,
} from "@/lib/finance/billingOverridesClient"

describe("isUsableBillingVersionId", () => {
  it("rejects null, undefined, empty, and the string undefined", () => {
    assert.equal(isUsableBillingVersionId(null), false)
    assert.equal(isUsableBillingVersionId(undefined), false)
    assert.equal(isUsableBillingVersionId(""), false)
    assert.equal(isUsableBillingVersionId("   "), false)
    assert.equal(isUsableBillingVersionId("undefined"), false)
  })

  it("accepts numeric and non-empty string ids", () => {
    assert.equal(isUsableBillingVersionId(42), true)
    assert.equal(isUsableBillingVersionId("42"), true)
  })
})

describe("fetchBillingOverridesClient", () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it("returns [] without fetching when versionId is empty", async () => {
    const fetchMock = mock.fn()
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock

    assert.deepEqual(await fetchBillingOverridesClient(""), [])
    assert.deepEqual(await fetchBillingOverridesClient(undefined), [])
    assert.deepEqual(await fetchBillingOverridesClient("undefined"), [])
    assert.equal(fetchMock.mock.callCount(), 0)
  })
})
