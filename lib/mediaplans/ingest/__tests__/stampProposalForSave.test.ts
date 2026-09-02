/**
 * SF-5 — all-bonus lines stamp buyType bonus from booking_status, never amount.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import type { SavePlanLineItem } from "@/lib/data/savePlan"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { evaluateReconciliationGate } from "../moneyTargets"
import type {
  IngestProposal,
  ProposedBurst,
  ProposedLineItem,
} from "../proposeLineItems"
import { stampProposalForSave } from "../stampProposalForSave"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const JCD_STATED = 311707.88

function burst(
  status: ProposedBurst["booking_status"],
  media_amount: number,
  dates: { start: string; end: string } = {
    start: "2026-01-01",
    end: "2026-01-07",
  },
): ProposedBurst {
  return {
    start_date: dates.start,
    end_date: dates.end,
    quantity: 1,
    media_amount,
    booking_status: status,
  }
}

function oohProposal(
  bursts: ProposedBurst[],
  extra?: {
    grouping?: Record<string, string>
    descriptors?: Record<string, string>
    file_stated_total?: number | null
    total_media_amount?: number
    accept_ok?: boolean
  },
): IngestProposal {
  const total =
    extra?.total_media_amount ??
    bursts.reduce((s, b) => s + (b.media_amount || 0), 0)
  const stated = extra?.file_stated_total ?? null
  const gate = evaluateReconciliationGate({
    total_media_amount: total,
    file_stated_total: stated,
  })
  const item: ProposedLineItem = {
    grouping: extra?.grouping ?? { format: "Large Format", state: "NSW" },
    panels: [
      {
        descriptors: extra?.descriptors ?? { site_number: "1" },
        raw_unmapped: {},
        source_publisher: "JCDecaux",
        source_row_ref: "Schedule!r10",
        flights: [],
        grid_period_count: 1,
      },
    ],
    bursts,
  }
  return {
    publisher_name: "JCDecaux",
    media_type: "ooh",
    sheet_name: "Schedule",
    line_items: [item],
    reconciliation: {
      line_item_count: 1,
      panel_count: 1,
      burst_count: bursts.length,
      total_media_amount: total,
      file_stated_total: stated,
      delta: gate.delta,
      delta_pct: gate.delta_pct,
      accept_ok: extra?.accept_ok ?? gate.ok,
      block_reason: gate.reason,
      warnings: [],
      charges_detected_total: 0,
    },
  }
}

function stampedMoney(line: SavePlanLineItem): number {
  const bursts = Array.isArray(line.bursts) ? line.bursts : []
  return bursts.reduce(
    (sum, b) => sum + parseBurstMoney((b as { budget?: unknown }).budget),
    0,
  )
}

test("all bursts bonus → buyType bonus", () => {
  const { lineItems } = stampProposalForSave(
    oohProposal([burst("bonus", 0)]),
    "sf5bn01",
  )
  assert.equal(lineItems[0]!.buyType, "bonus")
})

test("all bursts bonus_display → buyType bonus", () => {
  const { lineItems } = stampProposalForSave(
    oohProposal([burst("bonus_display", 0)]),
    "sf5bn02",
  )
  assert.equal(lineItems[0]!.buyType, "bonus")
})

test("mixed paid + bonus → buyType fixed_cost; bonus bursts still 0", () => {
  const { lineItems } = stampProposalForSave(
    oohProposal([
      burst("paid", 250, { start: "2026-01-01", end: "2026-01-07" }),
      burst("bonus", 0, { start: "2026-01-08", end: "2026-01-14" }),
    ]),
    "sf5mx01",
  )
  const line = lineItems[0]!
  assert.equal(line.buyType, "fixed_cost")
  const bursts = Array.isArray(line.bursts) ? line.bursts : []
  assert.equal(bursts.length, 2)
  const bonusBurst = bursts.find(
    (b) => String((b as { startDate?: string }).startDate ?? "").includes("08"),
  ) as { budget?: unknown; mediaAmount?: unknown } | undefined
  assert.ok(bonusBurst, "expected the bonus-week burst to survive stamp")
  assert.equal(parseBurstMoney(bonusBurst.budget), 0)
  assert.equal(parseBurstMoney(bonusBurst.mediaAmount), 0)
  assert.equal(stampedMoney(line), 250)
})

test("all paid → buyType fixed_cost", () => {
  const { lineItems } = stampProposalForSave(
    oohProposal([burst("paid", 100)]),
    "sf5pd01",
  )
  assert.equal(lineItems[0]!.buyType, "fixed_cost")
})

test("all paid at $0 (no money column) stays fixed_cost, not bonus; gate still refuses", () => {
  const proposal = oohProposal([burst("paid", 0), burst("paid", 0)], {
    file_stated_total: 10_000,
    total_media_amount: 0,
  })
  const gate = evaluateReconciliationGate({
    total_media_amount: proposal.reconciliation.total_media_amount,
    file_stated_total: proposal.reconciliation.file_stated_total,
  })
  assert.equal(gate.ok, false, "a paid $0 line is a money defect, not bonus")
  assert.equal(proposal.reconciliation.accept_ok, false)
  const { lineItems } = stampProposalForSave(proposal, "sf5z001")
  assert.equal(lineItems[0]!.buyType, "fixed_cost")
  assert.notEqual(lineItems[0]!.buyType, "bonus")
})

test("file-supplied buy_type panels wins over all-bonus booking_status", () => {
  const { lineItems } = stampProposalForSave(
    oohProposal([burst("bonus", 0), burst("bonus_display", 0)], {
      descriptors: { site_number: "1", buy_type: "panels" },
    }),
    "sf5pn01",
  )
  assert.equal(lineItems[0]!.buyType, "panels")
  assert.notEqual(lineItems[0]!.buyType, "bonus")
})

test("JCD converter total still $311,707.88 within 0.5% after bonus buyType", async () => {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok(review.proposal)
  const { lineItems } = stampProposalForSave(
    review.proposal!,
    "sf5jcd1",
    review.template_coverage?.resolved_controlled,
  )
  const stated = review.proposal!.reconciliation.file_stated_total ?? 0
  assert.ok(Math.abs(stated - JCD_STATED) < 1)
  const total = lineItems.reduce((s, line) => s + stampedMoney(line), 0)
  assert.ok(
    Math.abs(total - stated) / stated <= 0.005,
    `JCD stamped total ${total} moved vs file ${stated} — bonus money was being counted`,
  )
  const bonusCount = lineItems.filter((l) => l.buyType === "bonus").length
  const paidCount = lineItems.filter((l) => l.buyType === "fixed_cost").length
  console.log(
    `SF-5 JCD stamp: ${lineItems.length} lines, ${bonusCount} bonus, ${paidCount} fixed_cost, total ${total}`,
  )
})
