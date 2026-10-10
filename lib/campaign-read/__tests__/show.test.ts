import assert from "node:assert/strict"
import test from "node:test"

import {
  CAMPAIGN_READ_OUT_OF_DATE_CUE,
  campaignReadFailureToShow,
  campaignReadIsOutOfDate,
} from "../show"
import type { CampaignRead, CampaignReadStatus } from "../types"

function row(
  id: number,
  status: CampaignReadStatus,
  generatedAt: string,
): CampaignRead {
  return {
    id,
    mbaNumber: "BICAU002",
    versionNumber: 28,
    status,
    beats: {
      planned: "",
      happened: "",
      vsPlan: "",
      best: "",
      worst: "",
      upcoming: "",
    },
    bodyMarkdown: "",
    sources: null,
    errorMessage: status === "failed" ? "Timed out" : null,
    generatedAt,
    generatedByEmail: "luke@assembledmedia.com.au",
    editedAt: null,
    editedByEmail: null,
    publishedAt: status === "published" ? generatedAt : null,
    publishedByEmail: status === "published" ? "luke@assembledmedia.com.au" : null,
  }
}

test("a failed row older than a draft is not shown", () => {
  const failed = row(2, "failed", "2026-09-17T01:00:00.000Z")
  const draft = row(7, "draft", "2026-09-18T01:00:00.000Z")
  assert.equal(campaignReadFailureToShow([failed, draft]), null)
  assert.equal(campaignReadFailureToShow([draft, failed]), null)
})

test("a failed row newer than the draft is shown", () => {
  const draft = row(7, "draft", "2026-09-18T01:00:00.000Z")
  const failed = row(8, "failed", "2026-09-19T01:00:00.000Z")
  const shown = campaignReadFailureToShow([draft, failed])
  assert.equal(shown?.id, 8)
  assert.equal(shown?.errorMessage, "Timed out")
})

test("a failed row older than a published read is not shown", () => {
  const failed = row(2, "failed", "2026-09-17T01:00:00.000Z")
  const published = row(9, "published", "2026-09-20T01:00:00.000Z")
  assert.equal(campaignReadFailureToShow([failed, published]), null)
})

test("the age cue is for a read more than 7 days old", () => {
  const now = new Date("2026-10-10T00:00:00.000Z")
  const eightDays = "2026-10-01T23:59:59.000Z"
  const exactlySeven = "2026-10-03T00:00:00.000Z"
  assert.equal(campaignReadIsOutOfDate("2026-09-18T00:00:00.000Z", now), true)
  assert.equal(campaignReadIsOutOfDate(eightDays, now), true)
  assert.equal(campaignReadIsOutOfDate(exactlySeven, now), false)
  assert.equal(
    CAMPAIGN_READ_OUT_OF_DATE_CUE,
    "Out of date. Regenerate for current figures.",
  )
})
