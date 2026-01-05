import assert from "node:assert/strict";
import test from "node:test";
import { solveForOutput, solveForVariable } from "@/src/lib/learning/solver";
import { FormulaDSL } from "@/src/lib/learning/types";

const cpmFormula: FormulaDSL = {
  calculatorId: "cpm",
  expression: "(cost / impressions) * 1000",
  variables: [
    { key: "cost", label: "Cost", required: true },
    { key: "impressions", label: "Impressions", required: true },
  ],
  output: { label: "CPM", unit: "$" },
  format: "currency",
};

const ctrFormula: FormulaDSL = {
  calculatorId: "ctr",
  expression: "(clicks / impressions) * 100",
  variables: [
    { key: "clicks", label: "Clicks", required: true },
    { key: "impressions", label: "Impressions", required: true },
  ],
  output: { label: "CTR", unit: "%" },
  format: "percent",
};

const adRankFormula: FormulaDSL = {
  calculatorId: "ad-rank",
  expression: "bid * quality * context",
  variables: [
    { key: "bid", label: "Bid", required: true },
    { key: "quality", label: "Quality", required: true },
    { key: "context", label: "Context", required: true },
  ],
  output: { label: "Ad Rank" },
  format: "number",
};

test("CPM forward calculation", () => {
  const value = solveForOutput(cpmFormula, { cost: 500, impressions: 100_000 });
  assert.equal(value.toFixed(2), "5.00");
});

test("CPM inverse (cost)", () => {
  const value = solveForVariable({
    formula: cpmFormula,
    solveFor: "cost",
    values: { impressions: 100_000 },
    desiredOutput: 5,
  });
  assert.equal(value.toFixed(2), "500.00");
});

test("CTR inverse (clicks)", () => {
  const value = solveForVariable({
    formula: ctrFormula,
    solveFor: "clicks",
    values: { impressions: 20_000 },
    desiredOutput: 2,
  });
  assert.equal(value.toFixed(2), "400.00");
});

test("Ad Rank inverse (context)", () => {
  const value = solveForVariable({
    formula: adRankFormula,
    solveFor: "context",
    values: { bid: 10, quality: 3 },
    desiredOutput: 120,
  });
  assert.equal(value.toFixed(2), "4.00");
});
















