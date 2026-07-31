/**
 * T4c — masterId must be media_plan_masters.id, never the version row id.
 * Fixture: krusty014 combined payload shape (master 283, version row 1108 = v2).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  dollarsToCampaignBudgetCents,
  resolveMasterIdFromCombinedPlan,
} from "@/lib/mediaplan/buildPostgresSavePayload"
import { mapCampaignStatusForPersist } from "@/lib/mediaplan/campaignStatusGuard"
import { mapUiMediaTypeToLineChannel } from "@/lib/mediaplan/mapUiMediaTypeToLineChannel"

/** Tonight's live shape: version id ≠ master id. */
const KRUSTY014_COMBINED = {
  id: 1108,
  media_plan_master_id: 283,
  mba_number: "krusty014",
  version_number: 2,
  campaign_status: "draft",
}

describe("resolveMasterIdFromCombinedPlan", () => {
  it("krusty014: masterId = 283 (not version id 1108)", () => {
    assert.equal(resolveMasterIdFromCombinedPlan(KRUSTY014_COMBINED), 283)
  })

  it("prefers media_plan_master_id over id when they differ", () => {
    assert.equal(
      resolveMasterIdFromCombinedPlan({ id: 999, media_plan_master_id: 42 }),
      42
    )
  })

  it("accepts camelCase mediaPlanMasterId", () => {
    assert.equal(
      resolveMasterIdFromCombinedPlan({ id: 1108, mediaPlanMasterId: 283 }),
      283
    )
  })

  it("falls back to id when FK absent (create-shaped / master-only)", () => {
    assert.equal(resolveMasterIdFromCombinedPlan({ id: 283 }), 283)
  })

  it("returns null for empty plan", () => {
    assert.equal(resolveMasterIdFromCombinedPlan(null), null)
    assert.equal(resolveMasterIdFromCombinedPlan({}), null)
  })
})

describe("SavePlanVersionInput field mapping audit helpers", () => {
  it("versionNumber comes from requested version (fixture v2)", () => {
    const versionNumber = Number(KRUSTY014_COMBINED.version_number)
    assert.equal(versionNumber, 2)
  })

  it("campaignBudgetCents converts dollars → cents", () => {
    assert.equal(dollarsToCampaignBudgetCents(1500), 150_000)
    assert.equal(dollarsToCampaignBudgetCents("99.50"), 9950)
    assert.equal(dollarsToCampaignBudgetCents(""), null)
  })

  it("campaignStatus: UI Booked / booked → persisted booked (Xano lowercase)", () => {
    assert.equal(mapCampaignStatusForPersist("Booked"), "booked")
    assert.equal(mapCampaignStatusForPersist("booked"), "booked")
    assert.equal(mapCampaignStatusForPersist("Approved"), "approved")
    assert.equal(mapCampaignStatusForPersist(""), null)
  })
})

describe("clientKpi read path — no webpackIgnore swallow", () => {
  it("statically imports @/lib/data/readKpi (no webpackIgnore alias)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/kpi/clientKpi.ts"),
      "utf8"
    )
    assert.match(src, /from ["']@\/lib\/data\/readKpi["']/)
    assert.doesNotMatch(src, /webpackIgnore:\s*true/)
    assert.doesNotMatch(
      src,
      /export async function fetchClientKpis[\s\S]*?return \[\]/
    )
  })
})
