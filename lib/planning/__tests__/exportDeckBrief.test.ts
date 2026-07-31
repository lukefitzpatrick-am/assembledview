import assert from "node:assert/strict"
import test from "node:test"

import { buildExportDeckBrief } from "../exportDeckBrief.js"

test("export payload carries Stage A campaign name, not brand/client", () => {
  const payload = buildExportDeckBrief({
    clientName: "Acme Foods",
    brandOverride: "Acme Brand",
    campaignName: "Summer Push 2026",
    category: "FMCG",
    objectiveKind: "consideration",
    budget: 500_000,
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  })
  assert.equal(payload.campaignName, "Summer Push 2026")
  assert.equal(payload.clientName, "Acme Foods")
  assert.equal(payload.brandOverride, "Acme Brand")
  assert.notEqual(payload.campaignName, payload.brandOverride)
  assert.notEqual(payload.campaignName, payload.clientName)
})

test("export campaignName is never filled from brandOverride alone", () => {
  const payload = buildExportDeckBrief({
    clientName: "Acme Foods",
    brandOverride: "Acme Brand",
    campaignName: "",
    category: "FMCG",
    objectiveKind: null,
    budget: 0,
    startDate: null,
    endDate: null,
  })
  assert.equal(payload.campaignName, undefined)
  assert.equal(payload.brandOverride, "Acme Brand")
})
