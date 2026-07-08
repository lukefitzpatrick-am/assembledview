import assert from "node:assert/strict";
import test from "node:test";
import { buildKPITargetsMap } from "../../lib/kpi/deliveryTargets.js";
import {
  buildLineItemKpiTargetMap,
  deriveRateTargetFromBursts,
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

test("CPM derivation from real-shape burst ≈ 19.00", () => {
  const bursts = [
    {
      budget: "$45,000.00",
      buyAmount: "$19.00",
      mediaAmount: "$36,000.00",
      calculatedValue: 1_894_736.8421052631,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    },
  ];

  const result = deriveRateTargetFromBursts(bursts, "CPM");
  assert.ok(result);
  assert.equal(result.kind, "cpm");
  assert.ok(Math.abs(result.value - 19) < 0.01);
});

test("multi-burst CPM uses spend weighting, not mean of burst rates", () => {
  const bursts = [
    { mediaAmount: "$1,000.00", calculatedValue: 100_000 },
    { mediaAmount: "$2,000.00", calculatedValue: 50_000 },
  ];

  const result = deriveRateTargetFromBursts(bursts, "cpm");
  assert.ok(result);
  assert.equal(result.kind, "cpm");
  assert.ok(Math.abs(result.value - 20) < 0.0001);

  const meanOfRates = ((1000 / 100_000) * 1000 + (2000 / 50_000) * 1000) / 2;
  assert.ok(Math.abs(meanOfRates - 25) < 0.0001);
  assert.notEqual(result.value, meanOfRates);
});

test("buy_type CPC, malformed JSON, and zero deliverables return null", () => {
  const bursts = [{ mediaAmount: "$1,000.00", calculatedValue: 100_000 }];

  assert.equal(deriveRateTargetFromBursts(bursts, "CPC"), null);
  assert.equal(deriveRateTargetFromBursts("{not json", "CPM"), null);
  assert.equal(
    deriveRateTargetFromBursts([{ mediaAmount: "$1,000.00", calculatedValue: 0 }], "CPM"),
    null,
  );
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

test("accepts bursts_json as JSON string", () => {
  const bursts = JSON.stringify([
    { mediaAmount: "$36,000.00", calculatedValue: 1_894_736.8421052631 },
  ]);
  const result = deriveRateTargetFromBursts(bursts, "CPM");
  assert.ok(result);
  assert.ok(Math.abs(result.value - 19) < 0.01);
});
