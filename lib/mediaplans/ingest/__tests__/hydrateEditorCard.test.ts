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
  assert.ok(card.format.trim(), `${label}: Format empty`)
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

test("JCD accept→editor: card fields, real burst dates, non-zero money", async () => {
  const { stamped } = await stampFixture(
    "jcd_strength-meals_ooh.xlsx",
    "glenda0090h1",
  )
  assertPopulatedOohCard(stamped.lineItems[0]!, "glenda0090h1", "JCD")
})

test("QMS accept→editor: card fields, real burst dates, non-zero money", async () => {
  const { stamped } = await stampFixture(
    "qms_strength-meals_esb-ooh.xlsx",
    "qmsround01",
  )
  assertPopulatedOohCard(stamped.lineItems[0]!, "qmsround01", "QMS")
})
