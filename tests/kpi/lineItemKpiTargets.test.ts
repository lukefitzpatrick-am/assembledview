import assert from "node:assert/strict";
import test from "node:test";
import { buildKPITargetsMap } from "../../lib/kpi/deliveryTargets.js";
import {
  buildLineItemKpiTargetMap,
} from "../../lib/kpi/lineItemKpiTargets.js";
import type { CampaignKPI } from "../../lib/kpi/types.js";

function baseRow(overrides: Partial<CampaignKPI> & Pick<CampaignKPI, "line_item_id">): CampaignKPI {
  return {
    mp_client_name: "Client",
    mba_number: "MBA-001",
    version_number: 1,
    campaign_name: "Campaign",
    media_type: "socialMedia",
    publisher: "meta",
    bid_strategy: "manual_cpc",
    ctr: 0.03,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...overrides,
  };
}

test("line-item map keeps distinct rows that collide on publisher/bid_strategy", () => {
  const rows = [
    baseRow({ line_item_id: "SM-001", ctr: 0.03 }),
    baseRow({ line_item_id: "SM-002", ctr: 0.05 }),
  ];

  const legacy = buildKPITargetsMap(rows);
  assert.equal(legacy.size, 1);
  assert.equal(legacy.get("socialmedia::meta::manual_cpc")?.ctr, 0.05);

  const byLine = buildLineItemKpiTargetMap(rows);
  assert.equal(byLine.size, 2);
  assert.equal(byLine.get("MBA-001|1|sm-001")?.ctr, 0.03);
  assert.equal(byLine.get("MBA-001|1|sm-002")?.ctr, 0.05);
});

test("skips rows with missing line_item_id", () => {
  const map = buildLineItemKpiTargetMap([
    baseRow({ line_item_id: "SM-001" }),
    baseRow({ line_item_id: "" }),
    baseRow({ line_item_id: "   " }),
    { ...baseRow({ line_item_id: "SM-002" }), line_item_id: undefined },
  ]);

  assert.equal(map.size, 1);
  assert.ok(map.has("MBA-001|1|sm-001"));
});

