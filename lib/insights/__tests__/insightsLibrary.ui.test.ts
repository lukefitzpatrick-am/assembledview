import assert from "node:assert/strict"
import test from "node:test"

import type { CampaignInsightListItem, CampaignInsightRow } from "../queryCampaignInsights.js"

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
    source: "ava",
    confidence: null,
    createdBy: "a@b.com",
    createdAt: "2026-07-02T00:00:00Z",
    supersededBy: null,
    supersededAt: null,
    ...partial,
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
    { ...live, superseded: [old] },
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
    { ...row({ id: 1, body: "A", mbaNumber: "bicau001" }), superseded: [] },
    { ...row({ id: 2, body: "B", mbaNumber: "other001" }), superseded: [] },
    { ...row({ id: 3, body: "C", mbaNumber: "bicau001" }), superseded: [] },
  ]
  const mba = "bicau001"
  const scoped = items.filter((i) => i.mbaNumber === mba)
  assert.equal(scoped.length, 2)
  assert.ok(scoped.every((i) => i.mbaNumber === "bicau001"))
})

test("search match is on body content", () => {
  const items: CampaignInsightListItem[] = [
    { ...row({ id: 1, body: "Branded search CPA improved 18% MoM." }), superseded: [] },
    { ...row({ id: 2, body: "Meta frequency above 3.5 on core audience." }), superseded: [] },
  ]
  const q = "search"
  const hits = items.filter((i) => i.body.toLowerCase().includes(q))
  assert.equal(hits.length, 1)
  assert.match(hits[0]!.body, /search/i)
})
