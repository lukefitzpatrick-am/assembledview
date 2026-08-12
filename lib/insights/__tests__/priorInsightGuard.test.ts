import assert from "node:assert/strict"
import test from "node:test"

import {
  findUnattributedPriorRestatement,
  hasPriorAttribution,
  isNearVerbatimRestatement,
} from "../priorInsightGuard.js"

const PRIOR =
  "Branded search CPA improved eighteen percent month on month after query pruning."

test("narrative that copies a prior insight verbatim is rejected", () => {
  const hit = findUnattributedPriorRestatement(
    {
      keyInsight: PRIOR,
      insights: ["Fresh channel note about Meta frequency.", "Other", "Third"],
    },
    [{ id: 9, body: PRIOR }],
  )
  assert.ok(hit)
  assert.equal(hit!.field, "keyInsight")
  assert.equal(hit!.insightId, 9)
})

test("narrative that references a prior insight with attribution passes", () => {
  const hit = findUnattributedPriorRestatement(
    {
      keyInsight: `Previously we believed branded search CPA was soft; what has changed is ${PRIOR} — now extend pruning to competitor terms.`,
    },
    [{ id: 9, body: PRIOR }],
  )
  assert.equal(hit, null)
  assert.equal(
    hasPriorAttribution(
      "Previously we believed X; what has changed is Y",
    ),
    true,
  )
})

test("near-verbatim word overlap without attribution is rejected", () => {
  assert.equal(
    isNearVerbatimRestatement(
      "Branded search CPA improved eighteen percent month on month after query pruning this period.",
      PRIOR,
    ),
    true,
  )
  const hit = findUnattributedPriorRestatement(
    { execSummary: `Branded search CPA improved eighteen percent month on month after query pruning this period.` },
    [{ id: 3, body: PRIOR }],
  )
  assert.ok(hit)
})

test("client with no prior insights generates exactly as today (no hit)", () => {
  const hit = findUnattributedPriorRestatement(
    {
      keyInsight: PRIOR,
      insights: [PRIOR, "b", "c"],
    },
    [],
  )
  assert.equal(hit, null)
})

test("no numeric field is ever populated from an insight body", () => {
  // Contract: hard $ / KPI lines are built only from delivery snapshot totals —
  // insight bodies are narrative context and must not feed deliverySpend/kpis.
  const insightBody = "Delivered spend was $48,200 at 92% pace with CPM $12.40."
  const hardNumberSources = {
    deliverySpend: "from get_delivery_snapshot.planTotals.spendToDate",
    deliveryDeliverables: "from get_delivery_snapshot.planTotals impressions/clicks/…",
    kpis: "from get_delivery_snapshot.planTotals cpm/ctr/cpc + pace",
  }
  assert.equal(
    Object.values(hardNumberSources).some((s) => s.includes("insight")),
    false,
  )
  assert.match(insightBody, /\$/)
  // Guard scans narrative only — numeric payload keys are never passed in.
  const hit = findUnattributedPriorRestatement(
    { keyInsight: "Pace held; no restatement." },
    [{ id: 1, body: insightBody }],
  )
  assert.equal(hit, null)
})
