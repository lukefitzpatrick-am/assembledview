/**
 * DQ-6: campaign_status is stored lower case on every write path, so "Draft"
 * and "draft" can never both exist again. The helper, plus a source check that
 * each write path routes its value through it.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  PERSISTED_CAMPAIGN_STATUSES,
  campaignStatusForWrite,
  mapCampaignStatusForPersist,
} from "@/lib/mediaplan/campaignStatusGuard"

test("campaignStatusForWrite: trimmed lower case; empty is null; unknown is lower-cased, not kept as typed", () => {
  assert.equal(campaignStatusForWrite("Draft"), "draft")
  assert.equal(campaignStatusForWrite("  BOOKED "), "booked")
  assert.equal(campaignStatusForWrite("approved"), "approved")
  assert.equal(campaignStatusForWrite("On Hold"), "on hold")
  assert.equal(campaignStatusForWrite(""), null)
  assert.equal(campaignStatusForWrite("   "), null)
  assert.equal(campaignStatusForWrite(null), null)
  assert.equal(campaignStatusForWrite(undefined), null)
  for (const s of PERSISTED_CAMPAIGN_STATUSES) {
    assert.equal(campaignStatusForWrite(s.toUpperCase()), mapCampaignStatusForPersist(s.toUpperCase()), s)
  }
})

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")

test("every campaign_status write path goes through campaignStatusForWrite", () => {
  const patch = read("app/api/mediaplans/mba/[mba_number]/route.ts")
  assert.match(patch, /patch\.campaignStatus = campaignStatusForWrite\(data\.campaign_status\)/)

  const save = read("app/api/plans/save/route.ts")
  assert.match(save, /campaignStatus: campaignStatusForWrite\(body\.ensureMaster\.campaignStatus\)/)

  const masters = read("lib/data/writeMediaPlanMasters.ts")
  assert.match(masters, /campaignStatusForWrite\(input\.campaignStatus\) \?\? "draft"/)

  const plan = read("lib/data/savePlan.ts")
  assert.match(plan, /campaignStatus: campaignStatusForWrite\(masterStatus\?\.campaignStatus\)/)

  const status = read("lib/data/writeCampaignStatus.ts")
  assert.match(status, /const next = normaliseStatus\(status\)/)

  const create = read("app/api/mediaplans/route.ts")
  assert.doesNotMatch(create, /"Draft"/)
})
