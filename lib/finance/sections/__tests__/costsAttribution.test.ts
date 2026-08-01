import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  AP_ATTRIBUTION_RULE_TEXT,
  attributeApBillToPublisher,
  buildPublisherNameIndex,
} from "@/lib/finance/sections/costsAttribution"

describe("costsAttribution", () => {
  const index = buildPublisherNameIndex([
    { id: 1, publisherName: "Nine Network Pty Ltd" },
    { id: 2, publisherName: "Google" },
  ])

  it("matches contact name to publishers.publisher_name via normalizeContactKey", () => {
    const r = attributeApBillToPublisher("Nine Network Limited", index)
    assert.equal(r.method, "name")
    assert.equal(r.heuristic, true)
    assert.equal(r.publisherId, 1)
    assert.equal(r.publisherLabel, "Nine Network Pty Ltd")
  })

  it("falls back to booked identity labels", () => {
    const booked = new Map([["meta", "Meta"]])
    const r = attributeApBillToPublisher("Meta", index, booked)
    assert.equal(r.method, "name")
    assert.equal(r.publisherLabel, "Meta")
    assert.equal(r.publisherId, null)
  })

  it("leaves unmatched bills unattributed (never invents a match)", () => {
    const r = attributeApBillToPublisher("Random Vendor Co", index)
    assert.equal(r.method, "unattributed")
    assert.equal(r.publisherLabel, null)
  })

  it("documents that xero_contact_links is not used for AP→publisher", () => {
    assert.match(AP_ATTRIBUTION_RULE_TEXT, /xero_contact_links/)
    assert.match(AP_ATTRIBUTION_RULE_TEXT, /not used/)
  })
})
