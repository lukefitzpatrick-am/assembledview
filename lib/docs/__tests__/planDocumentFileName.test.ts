import assert from "node:assert/strict"
import test from "node:test"

import { planDocumentFileName } from "../planDocumentFileName.js"

test("plan and MBA names share one pattern", () => {
  assert.equal(
    planDocumentFileName({
      clientName: "Krusty Krab",
      campaignName: "AV Smoke Test 10 Oct",
      kind: "media_plan",
      draft: false,
      versionNumber: 1,
    }),
    "Krusty Krab - AV Smoke Test 10 Oct - Media Plan - v1.xlsx",
  )
  assert.equal(
    planDocumentFileName({
      clientName: "Krusty Krab",
      campaignName: "AV Smoke Test 10 Oct",
      kind: "mba",
      draft: false,
      versionNumber: "1",
    }),
    "Krusty Krab - AV Smoke Test 10 Oct - MBA - v1.pdf",
  )
  assert.equal(
    planDocumentFileName({
      clientName: "Krusty Krab",
      campaignName: "AV Smoke Test 10 Oct",
      kind: "media_plan",
      draft: true,
      versionNumber: 1,
    }),
    "DRAFT - Krusty Krab - AV Smoke Test 10 Oct - Media Plan - not for client.xlsx",
  )
  assert.equal(
    planDocumentFileName({
      clientName: "Krusty Krab",
      campaignName: "AV Smoke Test 10 Oct",
      kind: "mba",
      draft: true,
    }),
    "DRAFT - Krusty Krab - AV Smoke Test 10 Oct - MBA - not for client.pdf",
  )
})

test("AA stays a distinct media plan name and partial MBA stays marked", () => {
  assert.equal(
    planDocumentFileName({
      clientName: "Acme",
      campaignName: "Spring push",
      kind: "aa_media_plan",
      draft: false,
      versionNumber: 3,
    }),
    "Acme - Spring push - Media Plan (AA) - v3.xlsx",
  )
  assert.equal(
    planDocumentFileName({
      clientName: "Fixture Client",
      campaignName: "Fixture Campaign",
      kind: "mba",
      draft: false,
      versionNumber: 2,
      partial: true,
    }),
    "Fixture Client - Fixture Campaign - MBA - v2 partial.pdf",
  )
})

test("Windows-illegal characters are stripped from the name", () => {
  assert.equal(
    planDocumentFileName({
      clientName: 'Acme: / "Krab"',
      campaignName: "Push|now?",
      kind: "media_plan",
      draft: false,
      versionNumber: 1,
    }),
    "Acme Krab - Pushnow - Media Plan - v1.xlsx",
  )
})
