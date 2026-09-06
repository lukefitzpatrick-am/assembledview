/**
 * AV-1 — "Reviewed it" table carries staged totals (never re-summed in the prompt).
 * Builder: summariseIngestReview + formatIngestConfirmedBlock.
 * Line count: recon.line_item_count
 * Budget: recon.file_stated_total (gate file total)
 * Bonus: countBonusLineItemsFromProposal (SF-5 via stampProposalForSave)
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import {
  countBonusLineItemsFromProposal,
  stampProposalForSave,
} from "../stampProposalForSave"
import {
  formatIngestConfirmedBlock,
  summariseIngestReview,
  type IngestChatSummary,
} from "../summariseIngestReview"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const JCD = "jcd_strength-meals_ooh.xlsx"
const JCD_STATED = 311707.88

function fixtureSummary(over: Partial<IngestChatSummary> = {}): IngestChatSummary {
  return {
    stageId: "stg-av1",
    fileName: JCD,
    detected_publisher: "JCDecaux",
    publisher_confidence: 0.94,
    media_type: "ooh",
    line_item_count: 95,
    panel_count: 95,
    burst_count: 12,
    required_coverage: 1,
    money_delta: 0,
    money_delta_pct: 0,
    file_stated_total: JCD_STATED,
    total_media_amount: JCD_STATED,
    bonus_line_item_count: 38,
    accept_ok: true,
    block_reason: null,
    ignored: [],
    ignored_rows: [],
    columns_unmapped: [],
    unknown_publisher: false,
    no_profile_message: null,
    full_review_path: "/admin/schedule-ingest?stage=stg-av1",
    ...over,
  }
}

test("confirmed block prints total lines, gate budget, and SF-5 bonus from the summary", () => {
  const table = formatIngestConfirmedBlock(fixtureSummary())
  assert.match(table, /\| Total line items \| 95 \|/)
  assert.match(table, /\| Total budget \| \$311,707\.88 \|/)
  assert.match(table, /\| Bonus line items \| 38 \(of 95\) \|/)
})

test("JCD review summary totals match staged recon + SF-5 stamp (not a prompt re-sum)", async () => {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, JCD),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok(review.proposal)
  const summary = summariseIngestReview(review, {
    stageId: "stg-jcd",
    fileName: JCD,
  })
  const recon = review.proposal!.reconciliation
  const { lineItems } = stampProposalForSave(
    review.proposal!,
    "av1jcd01",
    review.template_coverage?.resolved_controlled,
  )
  const stampedBonus = lineItems.filter((l) => l.buyType === "bonus").length
  const countedBonus = countBonusLineItemsFromProposal(
    review.proposal!,
    review.template_coverage?.resolved_controlled,
  )

  assert.equal(summary.line_item_count, recon.line_item_count)
  assert.equal(summary.line_item_count, 95)
  assert.equal(summary.file_stated_total, recon.file_stated_total)
  assert.ok(Math.abs((summary.file_stated_total ?? 0) - JCD_STATED) < 0.005)
  assert.equal(summary.bonus_line_item_count, countedBonus)
  assert.equal(summary.bonus_line_item_count, stampedBonus)
  assert.equal(summary.bonus_line_item_count, 38)

  const table = formatIngestConfirmedBlock(summary)
  assert.match(table, /\| Total line items \| 95 \|/)
  assert.match(table, /\| Total budget \| \$311,707\.88 \|/)
  assert.match(table, /\| Bonus line items \| 38 \(of 95\) \|/)
  assert.match(table, /Excluded rows:/)
  assert.match(table, /INVESTMENT/i)
  assert.match(table, /×3/)
})
