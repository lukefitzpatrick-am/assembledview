/** The CTR tile bands delivered CTR against the plan target (the KPI band overlay sets it): above is Ahead, below is Behind. */
import assert from "node:assert/strict"
import { describe, it } from "vitest"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import { buildLineItemKpiTargetMap } from "@/lib/kpi/lineItemKpiTargets"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

const LINE = "mba001dv1"

function factRow(impressions: number, clicks: number): PacingRow {
  return {
    channel: "ad-serving",
    dateDay: "2026-03-01",
    adsetName: null,
    entityName: "Display",
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: "plc-1",
    amountSpent: 0,
    impressions,
    clicks,
    results: 0,
    video3sViews: 0,
    maxFivetranSyncedAt: null,
    updatedAt: null,
    lineItemId: LINE,
  }
}

function ctrStatuses(clicks: number) {
  const section = buildDirectDigitalChannelSection({
    key: "digital-display",
    title: "Display",
    lineItems: [{ line_item_id: LINE, buy_type: "cpm" }],
    combinedRows: [factRow(1000, clicks)],
    campaignStart: "2026-01-01",
    campaignEnd: "2026-12-31",
    mbaNumber: "mba001",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: buildLineItemKpiTargetMap([
      { mba_number: "mba001", version_number: 1, line_item_id: LINE, ctr: 0.01 } as CampaignKPI,
    ]),
    lastSyncedAt: null,
  })
  assert.ok(section)
  const ctr = (tiles: { label: string; status?: string }[]) => tiles.find((tile) => tile.label === "CTR")?.status
  return [ctr(section.aggregate.kpiBand.tiles), ctr(section.lineItems[0]?.block.kpiBand.tiles ?? [])]
}

describe("direct digital CTR pill", () => {
  it("reads delivered CTR against the target", () => {
    assert.deepEqual(ctrStatuses(20), ["ahead", "ahead"]) // 2% against 1%
    assert.deepEqual(ctrStatuses(5), ["behind", "behind"]) // 0.5% against 1%
  })
})
