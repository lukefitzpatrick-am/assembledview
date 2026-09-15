import assert from "node:assert/strict"
import test from "node:test"

import { matchPartnerSource } from "../matchSource"
import type { PartnerSourceMapRow } from "../types"

const CHANNEL_FACTORY: PartnerSourceMapRow = {
  senderDomain: "datorama.com",
  subjectPattern: "%1248052%",
  sourceSlug: "channel-factory",
  sourceLabel: "Channel Factory",
  isActive: true,
  expectedHeader:
    "Day|Campaign Advertiser ID|Campaign Name|Media Buy Name|Impressions|Clicks|Video Views|Video Completions 25% Rate|Video Completions 50% Rate|Video Completions 75% Rate|Video Fully Played Rate",
  headerRowHint: 5,
  maxStaleDays: 3,
  loadMode: "range_replace",
}

test("matches when sender domain and subject pattern both hit", () => {
  const hit = matchPartnerSource(
    {
      senderAddress: "noreply@datorama.com",
      subject: "Datorama Report 1248052 Daily Delivery",
    },
    [CHANNEL_FACTORY]
  )
  assert.equal(hit?.sourceSlug, "channel-factory")
})

test("rejects the shared Datorama domain when the report id is not ours", () => {
  const hit = matchPartnerSource(
    {
      senderAddress: "noreply@datorama.com",
      subject: "Datorama Report 9999999 Other Tenant",
    },
    [CHANNEL_FACTORY]
  )
  assert.equal(hit, null)
})

test("rejects a matching subject from the wrong domain", () => {
  const hit = matchPartnerSource(
    {
      senderAddress: "alerts@example.com",
      subject: "1248052",
    },
    [CHANNEL_FACTORY]
  )
  assert.equal(hit, null)
})

test("ignores inactive map rows", () => {
  const hit = matchPartnerSource(
    {
      senderAddress: "noreply@datorama.com",
      subject: "1248052",
    },
    [{ ...CHANNEL_FACTORY, isActive: false }]
  )
  assert.equal(hit, null)
})

test("reads a display-name mailbox address", () => {
  const hit = matchPartnerSource(
    {
      senderAddress: '"Datorama" <noreply@datorama.com>',
      subject: "assembled 1248052 export",
    },
    [CHANNEL_FACTORY]
  )
  assert.equal(hit?.sourceSlug, "channel-factory")
})
