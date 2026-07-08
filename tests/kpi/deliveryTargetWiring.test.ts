import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRateTargetFromLineItems,
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

test("aggregate CPM pools spend across cpm line items with different burst rates", () => {
  const items = [
    {
      line_item_id: "LI-1",
      buy_type: "cpm",
      bursts: [{ mediaAmount: "$1,000.00", calculatedValue: 100_000 }],
    },
    {
      line_item_id: "LI-2",
      buy_type: "cpm",
      bursts: [{ mediaAmount: "$2,000.00", calculatedValue: 50_000 }],
    },
  ];

  const pooled = aggregateRateTargetFromLineItems(items, "cpm");
  assert.ok(pooled);
  assert.ok(Math.abs(pooled - 20) < 0.0001);

  const meanOfRates = ((1000 / 100_000) * 1000 + (2000 / 50_000) * 1000) / 2;
  assert.notEqual(pooled, meanOfRates);
});

test("mixed cpm and cpv items compute each aggregate rate from matching buy types only", () => {
  const items = [
    {
      line_item_id: "LI-1",
      buy_type: "cpm",
      bursts: [{ mediaAmount: "$1,000.00", calculatedValue: 100_000 }],
    },
    {
      line_item_id: "LI-2",
      buy_type: "cpv",
      bursts: [{ mediaAmount: "$500.00", calculatedValue: 250_000 }],
    },
  ];

  const cpm = aggregateRateTargetFromLineItems(items, "cpm");
  const cpv = aggregateRateTargetFromLineItems(items, "cpv");

  assert.ok(cpm);
  assert.ok(Math.abs(cpm - 10) < 0.0001);
  assert.ok(cpv);
  assert.ok(Math.abs(cpv - 0.002) < 0.000001);
});

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
