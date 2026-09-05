/**
 * Assemble MBAData for regenerate when the slice path throws NO_FEE_BASIS.
 * Numbers come from the Excel adapter (DOC-3). Header date is published_at.
 */
import "./fixtures/xanoEnvStub"

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { groupLineItemsByMbaGetKey } from "@/lib/data/readMbaPlanDetail"
import { mapPlanVersionFromPostgres } from "@/lib/data/readMediaPlans"
import { mbaHeaderDateLabel } from "../buildMbaFromPersisted.js"
import { buildMediaItemsFromPlanDetail } from "../buildMediaItemsFromPersisted.js"
import { buildMbaDataFromExplodeAdapter } from "../mbaDataFromExplode.js"

const here = dirname(fileURLToPath(import.meta.url))
const LOGO = readFileSync(
  join(process.cwd(), "public/assembled-logo.png"),
).toString("base64")

const plan = JSON.parse(
  readFileSync(join(here, "fixtures/penfold001-v16.plan.json"), "utf8"),
) as {
  master: { mbaNumber: string; mpClientName: string }
  version: Record<string, unknown>
  feeSnapshot: Record<string, unknown>
  lineItems: Record<string, unknown>[]
}

function adapterFromPenfold() {
  return buildMediaItemsFromPlanDetail({
    versionData: mapPlanVersionFromPostgres({
      ...plan.version,
      mbaNumber: plan.master.mbaNumber,
      masterId: 0,
    }),
    clientName: plan.master.mpClientName,
    lineItems: groupLineItemsByMbaGetKey(plan.lineItems, {
      versionId: Number(plan.version.id),
      versionNumber: Number(plan.version.versionNumber),
      mbaNumber: plan.master.mbaNumber,
      mpClientName: plan.master.mpClientName,
    }),
    feeSnapshot: plan.feeSnapshot,
    publishers: [],
    logoBase64: LOGO,
  })
}

describe("buildMbaDataFromExplodeAdapter", () => {
  it("copies PENFOLD001 v16 adapter totals and pins Date to published_at", () => {
    const built = adapterFromPenfold()
    const publishedAt = new Date("2026-02-26T23:33:41.957Z")
    const mbaData = buildMbaDataFromExplodeAdapter({
      header: built.header,
      mbaData: built.mbaData,
      now: publishedAt,
    })

    assert.equal(mbaData.date, mbaHeaderDateLabel(publishedAt))
    assert.equal(mbaData.mba_number, "PENFOLD001")
    assert.equal(mbaData.campaign_name, built.header.campaignName)
    assert.equal(mbaData.campaign_brand, built.header.brand)
    assert.equal(mbaData.media_plan_version, built.header.planVersion)
    assert.equal(mbaData.client.name, built.header.client)
    assert.equal(mbaData.campaign.date_start, built.header.campaignStart)
    assert.equal(mbaData.campaign.date_end, built.header.campaignEnd)
    assert.equal(mbaData.totals.service_fee, 15)
    assert.equal(mbaData.totals.gross_media, built.mbaData.totals.gross_media)
    assert.equal(mbaData.totals.totals_ex_gst, built.mbaData.totals.totals_ex_gst)
    assert.equal(mbaData.totals.total_inc_gst, built.mbaData.totals.total_inc_gst)
    assert.equal(mbaData.totals.production, built.mbaData.totals.production)
    assert.equal(mbaData.totals.adserving, built.mbaData.totals.adserving)
  })
})
