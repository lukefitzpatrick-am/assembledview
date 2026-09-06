/**
 * AV-1 / IG-11 — parity report carries staged totals (never re-summed in the prompt).
 * Builder: summariseIngestReview + formatIngestConfirmedBlock.
 * Line count: recon.line_item_count
 * Budget: recon.file_stated_total (gate file total)
 * Bonus: countBonusLineItemsFromProposal (SF-5 via stampProposalForSave)
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { auditRowsFromProposal } from "../lineAudit"
import { reconcileLineAudit } from "../lineAuditReconcile"
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
const JCD_STATED = 131250.01
const JCD_RATE_CARD = 403820.48
const JCD_DISCOUNT = 0.675

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
    rate_card_total: JCD_RATE_CARD,
    rate_card_discount_pct: JCD_DISCOUNT,
    bonus_line_item_count: 38,
    accept_ok: true,
    block_reason: null,
    ignored: [],
    ignored_rows: [],
    columns_unmapped: [],
    unknown_publisher: false,
    no_profile_message: null,
    full_review_path: "/mediaplans/mba/create/ingest/stg-av1",
    ...over,
  }
}

test("parity report prints total lines, gate budget, and SF-5 bonus from the summary", () => {
  const table = formatIngestConfirmedBlock(fixtureSummary())
  assert.match(table, /Here's the parity report for this JCDecaux schedule/)
  assert.match(table, /\| Total line items \| 95 \|/)
  assert.match(table, /\| Line sum \| \$131,250\.01 \|/)
  assert.match(table, /\| Stated cell \| \$131,250\.01 \|/)
  assert.match(table, /\| Total budget \| \$131,250\.01 \|/)
  assert.match(table, /\| Rate-card value \| \$403,820\.48 · discount 67\.5% \|/)
  assert.match(table, /\| Bonus line items \| 38 \(of 95\) \|/)
  assert.match(table, /\| Green \/ discrepancies \| 95 \/ 0 \|/)
  assert.match(table, /## Discrepancies/)
  assert.match(table, /None\./)
  assert.match(table, /Open Parse Review: \/mediaplans\/mba\/create\/ingest\/stg-av1/)
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
  assert.equal(
    summary.full_review_path,
    "/mediaplans/mba/create/ingest/stg-jcd",
  )

  const audit = reconcileLineAudit(review.proposal!, {
    model: "mock-audit",
    status: "complete",
    chunks: 1,
    rows: auditRowsFromProposal(review.proposal!),
  })
  const pkg = { ...review, line_audit: audit }
  const table = formatIngestConfirmedBlock(summary, pkg)
  assert.match(table, /Here's the parity report/)
  assert.match(table, /\| Total line items \| 95 \|/)
  assert.match(table, /\| Line sum \| \$131,250\.01 \|/)
  assert.match(table, /\| Stated cell \| \$131,250\.01 \|/)
  assert.match(table, /\| Total budget \| \$131,250\.01 \|/)
  assert.match(table, /\| Green \/ discrepancies \| 95 \/ 0 \|/)
  assert.match(table, /\| Rate-card value \| \$403,820\.48 · discount 67\.5% \|/)
  assert.match(table, /\| Bonus line items \| 38 \(of 95\) \|/)
  assert.match(table, /## Discrepancies/)
  assert.match(table, /None\./)
  assert.match(table, /Excluded rows:/)
  assert.match(table, /INVESTMENT/i)
  assert.match(table, /×3/)
  assert.match(table, /Open Parse Review: \/mediaplans\/mba\/create\/ingest\/stg-jcd/)
})
