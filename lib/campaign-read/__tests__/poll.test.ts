import assert from "node:assert/strict"
import test from "node:test"

import {
  CAMPAIGN_READ_POLL_FETCH_INIT,
  CAMPAIGN_READ_POLL_MAX_MS,
  campaignReadPollShouldStop,
} from "../poll.js"

test("poll fetch sends credentials and avoids the store", () => {
  assert.equal(CAMPAIGN_READ_POLL_FETCH_INIT.credentials, "include")
  assert.equal(CAMPAIGN_READ_POLL_FETCH_INIT.cache, "no-store")
})

test("poll stops after the 3 minute cap", () => {
  const startedAt = 1_000
  assert.equal(campaignReadPollShouldStop(startedAt, startedAt + CAMPAIGN_READ_POLL_MAX_MS - 1), false)
  assert.equal(campaignReadPollShouldStop(startedAt, startedAt + CAMPAIGN_READ_POLL_MAX_MS), true)
  assert.equal(campaignReadPollShouldStop(startedAt, startedAt + CAMPAIGN_READ_POLL_MAX_MS + 3_000), true)
})
