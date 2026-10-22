import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRatioTargetFromLineItems,
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

test("aggregate CTR target requires identical stored values across all lines", () => {
  const rows = [
    baseRow({ line_item_id: "LI-1", ctr: 0.03 }),
    baseRow({ line_item_id: "LI-2", ctr: 0.03 }),
  ];
  const map = buildLineItemKpiTargetMap(rows);

  const same = aggregateRatioTargetFromLineItems(
    [{ line_item_id: "LI-1" }, { line_item_id: "LI-2" }],
    map,
    "MBA-001",
    1,
    "ctr",
  );
  assert.equal(same, 0.03);

  const rowsDiff = [
    baseRow({ line_item_id: "LI-1", ctr: 0.03 }),
    baseRow({ line_item_id: "LI-2", ctr: 0.05 }),
  ];
  const mapDiff = buildLineItemKpiTargetMap(rowsDiff);

  const mixed = aggregateRatioTargetFromLineItems(
    [{ line_item_id: "LI-1" }, { line_item_id: "LI-2" }],
    mapDiff,
    "MBA-001",
    1,
    "ctr",
  );
  assert.equal(mixed, null);
});

test("missing campaign_kpi row on one line yields null aggregate CTR target", () => {
  const map = buildLineItemKpiTargetMap([baseRow({ line_item_id: "LI-1", ctr: 0.03 })]);

  const result = aggregateRatioTargetFromLineItems(
    [{ line_item_id: "LI-1" }, { line_item_id: "LI-2" }],
    map,
    "MBA-001",
    1,
    "ctr",
  );
  assert.equal(result, null);
});
