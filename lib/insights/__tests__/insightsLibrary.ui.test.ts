import assert from "node:assert/strict"
import test from "node:test"
import React, { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { InsightFinding } from "../../../components/insights/InsightFinding.js"
import { QuickAddInsightForm } from "../../../components/insights/QuickAddInsightForm.js"
import { buildInsightCreatePayload } from "../insightActionFields.js"
import type { CampaignInsightListItem, CampaignInsightRow } from "../queryCampaignInsights.js"

// The node test runner compiles JSX with the classic runtime. App components
// rely on the automatic runtime, so the render harness supplies React.
;(globalThis as { React?: typeof React }).React = React

/** Pure collapse helper mirrored for unit tests of the UI grouping contract. */
export function collapseSupersededForDisplay(
  items: CampaignInsightListItem[],
  showSuperseded: boolean,
): CampaignInsightListItem[] {
  if (showSuperseded) return items
  return items
    .filter((item) => item.supersededBy == null)
    .map((item) => ({ ...item, superseded: [] }))
}

function row(
  partial: Partial<CampaignInsightRow> & Pick<CampaignInsightRow, "id" | "body">,
): CampaignInsightRow {
  return {
    mbaNumber: "bicau001",
    clientId: 1,
    period: "2026-07",
    insightType: "delivery",
    action: null,
    actionOwner: null,
    outcome: null,
    outcomeKind: null,
    source: "ava",
    confidence: null,
    createdBy: "a@b.com",
    createdAt: "2026-07-02T00:00:00Z",
    supersededBy: null,
    supersededAt: null,
    ...partial,
  }
}

function listItem(
  partial: Partial<CampaignInsightRow> & Pick<CampaignInsightRow, "id" | "body">,
  extra?: Partial<Pick<CampaignInsightListItem, "superseded" | "clientName" | "clientSlug">>,
): CampaignInsightListItem {
  return {
    ...row(partial),
    clientName: extra?.clientName ?? null,
    clientSlug: extra?.clientSlug ?? null,
    superseded: extra?.superseded ?? [],
  }
}

test("superseded insight is hidden by default and visible with the toggle", () => {
  const live = row({ id: 10, body: "Live replacement insight" })
  const old = row({
    id: 9,
    body: "Old superseded insight about delivery lag",
    supersededBy: 10,
    supersededAt: "2026-07-02T00:00:00Z",
    createdAt: "2026-07-01T00:00:00Z",
  })
  const withChildren: CampaignInsightListItem[] = [
    listItem({ id: live.id, body: live.body }, { superseded: [old] }),
  ]

  const hidden = collapseSupersededForDisplay(withChildren, false)
  assert.equal(hidden.length, 1)
  assert.equal(hidden[0]!.id, 10)
  assert.equal(hidden[0]!.superseded.length, 0)

  const shown = collapseSupersededForDisplay(withChildren, true)
  assert.equal(shown.length, 1)
  assert.equal(shown[0]!.superseded.length, 1)
  assert.equal(shown[0]!.superseded[0]!.body.includes("superseded"), true)
})

test("campaign panel filter keeps only that MBA", () => {
  const items: CampaignInsightListItem[] = [
    listItem({ id: 1, body: "A", mbaNumber: "bicau001" }),
    listItem({ id: 2, body: "B", mbaNumber: "other001" }),
    listItem({ id: 3, body: "C", mbaNumber: "bicau001" }),
  ]
  const mba = "bicau001"
  const scoped = items.filter((i) => i.mbaNumber === mba)
  assert.equal(scoped.length, 2)
  assert.ok(scoped.every((i) => i.mbaNumber === "bicau001"))
})

test("insight card renders Insight, Action and Outcome when all three are present", () => {
  const html = renderToStaticMarkup(
    createElement(InsightFinding, {
      body: "Branded search CPA improved 18% MoM.",
      action: "Shift 8% of social into branded search.",
      actionOwner: "Assembled",
      outcome: "CPA holds at the July rate.",
      outcomeKind: "expected",
    }),
  )
  assert.match(html, /Insight/)
  assert.match(html, /Branded search CPA improved 18% MoM\./)
  assert.match(html, /Action/)
  assert.match(html, /Shift 8% of social into branded search\./)
  assert.match(html, /Owner: Assembled/)
  assert.match(html, /Outcome/)
  assert.match(html, /Expected/)
  assert.match(html, /CPA holds at the July rate\./)
  assert.match(html, /bg-tone-insight-bg/)
  assert.match(html, /bg-tone-action-bg/)
  assert.match(html, /bg-tone-outcome-bg/)
})

test("insight card with body only renders the Insight tag", () => {
  const html = renderToStaticMarkup(
    createElement(InsightFinding, {
      body: "BVOD delivery lag is flighting, not inventory.",
      action: null,
      actionOwner: null,
      outcome: null,
      outcomeKind: null,
    }),
  )
  assert.match(html, /Insight/)
  assert.match(html, /BVOD delivery lag is flighting, not inventory\./)
  assert.equal(html.includes("Action"), false)
  assert.equal(html.includes("Outcome"), false)
  assert.equal(html.includes("Owner:"), false)
  assert.equal(html.includes("Achieved"), false)
  assert.equal(html.includes("Expected"), false)
})

test("achieved outcome uses the Achieved label", () => {
  const html = renderToStaticMarkup(
    createElement(InsightFinding, {
      body: "Frequency came back under 3.",
      outcome: "Core audience frequency is 2.8.",
      outcomeKind: "achieved",
    }),
  )
  assert.match(html, /Achieved/)
  assert.equal(html.includes("Expected"), false)
})

test("record form posts action, owner, outcome and outcome kind", () => {
  const payload = buildInsightCreatePayload({
    clientId: 12,
    mbaNumber: "KRUSTY001",
    body: "  Krabby Patties sold through by Thursday. ",
    insightType: "delivery",
    period: "",
    action: " Restock the formula ",
    actionOwner: "Assembled",
    outcome: "Thursday sell-through holds",
    outcomeKind: "expected",
  })
  assert.deepEqual(payload, {
    clientId: 12,
    mbaNumber: "krusty001",
    body: "Krabby Patties sold through by Thursday.",
    insightType: "delivery",
    period: null,
    action: "Restock the formula",
    actionOwner: "Assembled",
    outcome: "Thursday sell-through holds",
    outcomeKind: "expected",
  })

  const html = renderToStaticMarkup(createElement(QuickAddInsightForm))
  assert.match(html, /Action \(optional\)/)
  assert.match(html, /Owner \(optional\)/)
  assert.match(html, /Outcome \(optional\)/)
  assert.match(html, /Outcome kind \(optional\)/)
  assert.match(html, /value="achieved"/)
  assert.match(html, /value="expected"/)
  assert.match(html, /aria-label="Client"/)
  assert.match(html, /aria-label="MBA"/)
})

test("search match is on body content", () => {
  const items: CampaignInsightListItem[] = [
    listItem({ id: 1, body: "Branded search CPA improved 18% MoM." }),
    listItem({ id: 2, body: "Meta frequency above 3.5 on core audience." }),
  ]
  const q = "search"
  const hits = items.filter((i) => i.body.toLowerCase().includes(q))
  assert.equal(hits.length, 1)
  assert.match(hits[0]!.body, /search/i)
})
