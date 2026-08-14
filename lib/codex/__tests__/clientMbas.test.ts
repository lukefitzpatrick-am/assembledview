import assert from "node:assert/strict"
import { test } from "node:test"

import {
  campaignsForClientFromPlans,
  formatMbaOptionLabel,
  mbaSelectCampaigns,
  matchMbaCampaignSearch,
} from "../clientMbas.js"

const PLANS = [
  {
    mba_number: "PENFOLD002",
    client_id: 12,
    campaign_name: "Winter flight",
  },
  {
    mba_number: "PENFOLD012",
    client_id: 12,
    campaign_name: "Summer brand",
  },
  {
    mba_number: "PENFOLD001",
    client_id: 12,
    campaign_name: "Always on",
  },
  { mba_number: "OTHER099", client_id: 99, campaign_name: "Other" },
  { mba_number: "PENFOLD2", client_id: 12, campaign_name: "Short code" },
]

test("campaignsForClientFromPlans labels mba — campaign, ordered desc", () => {
  const rows = campaignsForClientFromPlans(PLANS, 12)
  assert.deepEqual(
    rows.map((r) => r.mba_number),
    ["PENFOLD012", "PENFOLD002", "PENFOLD2", "PENFOLD001"],
  )
  assert.equal(rows[0]?.label, "PENFOLD012 — Summer brand")
  assert.ok(!rows.some((r) => r.mba_number === "OTHER099"))
})

test("formatMbaOptionLabel falls back to the MBA number when name is blank", () => {
  assert.equal(formatMbaOptionLabel("FOO001", ""), "FOO001")
  assert.equal(formatMbaOptionLabel("FOO001", "Brand"), "FOO001 — Brand")
})

test("search matches MBA number and campaign name", () => {
  const rows = campaignsForClientFromPlans(PLANS, 12)
  assert.deepEqual(
    matchMbaCampaignSearch(rows, "summer").map((r) => r.mba_number),
    ["PENFOLD012"],
  )
  assert.deepEqual(
    matchMbaCampaignSearch(rows, "penfold002").map((r) => r.mba_number),
    ["PENFOLD002"],
  )
})

test("mbaSelectCampaigns keeps a legacy MBA visible", () => {
  const client = campaignsForClientFromPlans(PLANS, 12)
  const withLegacy = mbaSelectCampaigns(client, "LEGACY001")
  assert.equal(withLegacy[0]?.mba_number, "PENFOLD012")
  assert.ok(withLegacy.some((r) => r.mba_number === "LEGACY001"))
})
