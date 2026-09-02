/**
 * MR-12 — accept → editor card must look like a planner built it.
 * Simulates stamp → Postgres reassembly → OOH/Radio hydrate.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { hydrateOohEditorLine } from "../hydrateEditorCard"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { stampProposalForSave } from "../stampProposalForSave"
import type { SavePlanLineItem } from "@/lib/data/savePlan"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")

const CAMPAIGN_START = new Date(2026, 7, 1) // 01/08 — the empty-card default
const CAMPAIGN_END = new Date(2026, 7, 31)

function assembleStamped(line: SavePlanLineItem, mba: string) {
  return mapLineItemFromPostgres(
    {
      id: 1,
      channel: line.channel,
      lineItemId: line.lineItemId,
      position: line.position ?? 0,
      market: line.market,
      buyingDemo: line.buyingDemo,
      buyType: line.buyType,
      publisher: line.publisher,
      platform: line.platform ?? null,
      bidStrategy: line.bidStrategy ?? null,
      fixedCostMedia: line.fixedCostMedia ?? false,
      clientPaysForMedia: line.clientPaysForMedia ?? false,
      budgetIncludesFees: line.budgetIncludesFees ?? false,
      noAdserving: line.noAdserving ?? true,
      bursts: line.bursts,
      attrs: line.attrs ?? {},
    },
    {
      versionId: 1,
      versionNumber: 1,
      mbaNumber: mba,
      mpClientName: "Test",
    },
  )
}

async function stampFixture(file: string, mba: string) {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, file),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok(review.proposal, `${file} missing proposal`)
  const stamped = stampProposalForSave(review.proposal!, mba)
  assert.ok(stamped.lineItems.length > 0, `${file} stamped zero lines`)
  return { review, stamped }
}

function assertPopulatedOohCard(
  line: SavePlanLineItem,
  mba: string,
  label: string,
) {
  const assembled = assembleStamped(line, mba)
  const card = hydrateOohEditorLine(assembled, {
    campaignStartDate: CAMPAIGN_START,
    campaignEndDate: CAMPAIGN_END,
    feePct: 0,
  })
  assert.ok(card.network.trim(), `${label}: Network empty`)
  assert.equal(card.buyType, "fixed_cost", `${label}: buyType ${card.buyType}`)
  assert.ok(card.market.trim(), `${label}: Market empty`)
  assert.ok(card.bursts.length > 0, `${label}: no bursts`)
  const money = card.bursts.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
  assert.ok(money > 0, `${label}: money ${money}`)
  const first = card.bursts[0]!
  const start = first.startDate
  assert.ok(start instanceof Date && !Number.isNaN(start.getTime()))
  const isCampaignDefault =
    start.getFullYear() === 2026 &&
    start.getMonth() === 7 &&
    start.getDate() === 1 &&
    money === 0
  assert.equal(
    isCampaignDefault,
    false,
    `${label}: still the empty 01/08–31/08 $0 default burst`,
  )
}

test("hydrateOohEditorLine with an unresolvable buy type returns null and carries the raw", () => {
  const card = hydrateOohEditorLine(
    {
      publisher: "QMS",
      buyType: "zzzz-not-a-buy-type",
      attrs: { network: "QMS" },
    },
    {
      campaignStartDate: CAMPAIGN_START,
      campaignEndDate: CAMPAIGN_END,
      feePct: 0,
    },
  )
  assert.equal(card.buyType, null)
  assert.notEqual(card.buyType, "")
  assert.equal(card.attrs?.buyType_unresolved_raw, "zzzz-not-a-buy-type")
})

test("JCD accept→editor: 106 buy-row lines (not the old 118 data_rows incl. totals), each card from its own row, money sums to file total", async () => {
  const { review, stamped } = await stampFixture(
    "jcd_strength-meals_ooh.xlsx",
    "glenda0090h1",
  )
  assert.equal(stamped.lineItems.length, 106)
  assert.equal(stamped.panels.length, 106)
  const stated = review.proposal!.reconciliation.file_stated_total ?? 0
  assert.ok(Math.abs(stated - 311707.88) < 1)

  let moneySum = 0
  const sourceRows = new Set<string>()
  const lineIds = new Set<string>()
  let paidCards = 0
  for (let i = 0; i < stamped.lineItems.length; i++) {
    const line = stamped.lineItems[i]!
    const panel = stamped.panels[i]!
    assert.equal(panel.lineItemId, line.lineItemId)
    assert.equal(line.attrs?.buy_granularity, "panel")
    assert.ok(panel.sourceRowRef, `JCD[${i}]: missing sourceRowRef`)
    sourceRows.add(panel.sourceRowRef!)
    lineIds.add(line.lineItemId)
    const assembled = assembleStamped(line, "glenda0090h1")
    const card = hydrateOohEditorLine(assembled, {
      campaignStartDate: CAMPAIGN_START,
      campaignEndDate: CAMPAIGN_END,
      feePct: 0,
    })
    assert.ok(card.network.trim(), `JCD[${i}]: Network empty`)
    assert.equal(card.format, "large_format", `JCD[${i}]: format ${card.format}`)
    const rawFormat = String(card.attrs?.publisher_format_name ?? "").trim()
    assert.ok(rawFormat, `JCD[${i}]: publisher_format_name missing`)
    assert.notEqual(rawFormat, "large_format")
    assert.ok(
      String(panel.publisherFormatName ?? "").trim() || rawFormat,
      `JCD[${i}]: panel publisherFormatName missing`,
    )
    assert.equal(card.buyType, "fixed_cost")
    assert.ok(card.market.trim(), `JCD[${i}]: Market empty`)
    assert.ok(card.bursts.length > 0, `JCD[${i}]: no bursts`)
    const money = card.bursts.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
    moneySum += money
    if (money > 0) paidCards++
  }
  assert.ok(paidCards > 0, "expected paid rows with money")
  assert.ok(
    Math.abs(moneySum - stated) / stated <= 0.005,
    `hydrated money ${moneySum} vs file ${stated}`,
  )
  // Per-row identity is sourceRowRef, not site+format+market. JCD repeats
  // the same site on separate buy rows (different flights); collapsing those
  // would be the old grouped model. Duplicate descriptors are expected.
  assert.equal(sourceRows.size, 106)
  assert.equal(lineIds.size, 106)
})

test("QMS accept→editor: 41 lines (supersedes grouped 3-of-41), each card from its own row", async () => {
  const { review, stamped } = await stampFixture(
    "qms_strength-meals_esb-ooh.xlsx",
    "qmsround01",
  )
  assert.equal(stamped.lineItems.length, 41)
  assert.equal(stamped.panels.length, 41)
  assert.equal(review.proposal!.reconciliation.line_item_count, 41)
  assertPopulatedOohCard(stamped.lineItems[0]!, "qmsround01", "QMS[0]")
  for (const line of stamped.lineItems) {
    const assembled = assembleStamped(line, "qmsround01")
    const card = hydrateOohEditorLine(assembled, {
      campaignStartDate: CAMPAIGN_START,
      campaignEndDate: CAMPAIGN_END,
      feePct: 0,
    })
    assert.ok(card.network.trim(), "Network empty")
    assert.equal(card.format, null, "QMS Digital must not be coerced to empty")
    assert.notEqual(card.format, "")
    const rawFormat = String(
      card.attrs?.format_unresolved_raw ??
        card.attrs?.publisher_format_name ??
        "",
    ).trim()
    assert.ok(rawFormat, "QMS unresolved format raw missing")
    assert.equal(card.attrs?.format_unresolved_raw, rawFormat)
    assert.ok(card.market.trim(), "Market empty")
    assert.ok(card.bursts.length > 0)
  }
})
