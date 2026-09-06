/**
 * IG-8 — JCD ingest → expert OOH round-trip must keep status-grid flights.
 * Bonus occupancy must not fall through to the campaign-dated empty line.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import {
  mapOohExpertRowsToStandardLineItems,
  mapStandardOohLineItemsToExpertRows,
  type StandardOohFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { stampProposalForSave } from "../stampProposalForSave"
import { ingestReviewToFormLineItems } from "../toFormLineItems"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const CS = new Date(2026, 6, 1)
const CE = new Date(2027, 5, 30)

function ymd(d: Date | string) {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
}

function spanOf(b: { startDate: Date | string; endDate: Date | string }) {
  return `${ymd(b.startDate)}→${ymd(b.endDate)}`
}

test("JCD expert round-trip keeps file p/B weeks (no campaign default, no 28 Sep clamp)", async () => {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok(review.proposal)
  const stamped = stampProposalForSave(
    review.proposal!,
    "ig8exp1",
    review.template_coverage?.resolved_controlled,
  )
  const form = ingestReviewToFormLineItems(review)
  const items = form.items as StandardOohFormLineItem[]
  assert.equal(items.length, stamped.lineItems.length)

  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE, 0)
  const rows = mapStandardOohLineItemsToExpertRows(items, cols, CS, CE)
  const back = mapOohExpertRowsToStandardLineItems(rows, cols, CS, CE, {
    feePctOoh: 0,
  })
  assert.equal(back.length, items.length)

  const campaignDated: string[] = []
  for (let i = 0; i < back.length; i++) {
    const ref = stamped.panels[i]?.sourceRowRef ?? String(i)
    for (const b of back[i]!.bursts) {
      if (spanOf(b) === "2026-07-01→2027-06-30") campaignDated.push(ref)
    }
  }
  assert.deepEqual(
    campaignDated,
    [],
    `expert round-trip campaign-dated bursts: ${campaignDated.join(", ")}`,
  )

  function atRow(n: number) {
    const i = stamped.panels.findIndex((p) =>
      (p.sourceRowRef ?? "").endsWith(`!r${n}`),
    )
    assert.ok(i >= 0, `missing r${n}`)
    return back[i]!
  }

  const brookvale = atRow(30)
  assert.equal(brookvale.bursts.length, 1)
  assert.equal(spanOf(brookvale.bursts[0]!), "2027-02-15→2027-02-21")

  const bundoora = atRow(62)
  assert.equal(bundoora.bursts.length, 2, "r62 paid + bonus must not merge")
  const paid62 = bundoora.bursts.find((b) => parseBurstMoney(b.budget) > 0)
  const bonus62 = bundoora.bursts.find((b) => parseBurstMoney(b.budget) === 0)
  assert.ok(paid62 && bonus62)
  assert.equal(spanOf(paid62), "2026-10-26→2026-11-01")
  assert.equal(spanOf(bonus62), "2027-03-15→2027-03-21")
  assert.ok(Math.abs(parseBurstMoney(paid62.budget) - 306.08) < 0.005)

  const r67 = atRow(67)
  assert.equal(r67.bursts.length, 1)
  assert.equal(spanOf(r67.bursts[0]!), "2026-09-28→2026-10-04")

  const r120 = atRow(120)
  const paid120 = r120.bursts.filter((b) => parseBurstMoney(b.budget) > 0)
  assert.equal(paid120.length, 2)
  const sum120 = paid120.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
  assert.ok(Math.abs(sum120 - 3265.24) < 0.005, `r120 ${sum120}`)

  const r128 = atRow(128)
  const paid128 = r128.bursts.filter((b) => parseBurstMoney(b.budget) > 0)
  assert.equal(paid128.length, 3)
  const sum128 = paid128.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
  assert.ok(Math.abs(sum128 - 1615.72) < 0.005, `r128 ${sum128}`)

  for (const n of [126, 127, 129, 130, 132]) {
    const rail = atRow(n)
    assert.equal(rail.bursts.length, 2, `Rail Brisbane r${n} two bonus bursts`)
  }
})
