/**
 * SF-5 — all-bonus lines stamp buyType bonus from booking_status, never amount.
 * SF-6 — burst buyAmount is a rate (status_matrix/currency) or a spot count
 * (count), never a period count masquerading as $1.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import type { SavePlanLineItem } from "@/lib/data/savePlan"
import { buildIngestReviewFromFile, type IngestReviewPackage } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { evaluateReconciliationGate } from "../moneyTargets"
import type { GridSemantics } from "../publisherProfileConfig"
import type {
  IngestProposal,
  ProposedBurst,
  ProposedLineItem,
} from "../proposeLineItems"
import { stampProposalForSave } from "../stampProposalForSave"
import { ingestReviewToFormLineItems } from "../toFormLineItems"

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
    grid_semantics?: GridSemantics
    bought_rate?: number | null
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
    bought_rate: extra?.bought_rate,
  }
  return {
    publisher_name: "JCDecaux",
    media_type: "ooh",
    grid_semantics: extra?.grid_semantics ?? "status_matrix",
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

function stampedBuyAmount(line: SavePlanLineItem): string {
  const bursts = Array.isArray(line.bursts) ? line.bursts : []
  return String((bursts[0] as { buyAmount?: unknown } | undefined)?.buyAmount ?? "")
}

/** Mirrors OOHContainer L771 — empty buyAmount falls back to 1 for deliverable math. */
function oohCardBuyAmountParsed(buyAmount: string): number {
  return parseFloat(buyAmount.replace(/[^0-9.]/g, "") || "1")
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
  assert.equal(lineItems.length, 95)
  assert.equal(bonusCount, 38)
  assert.equal(paidCount, 57)
  console.log(
    `SF-5 JCD stamp: ${lineItems.length} lines, ${bonusCount} bonus, ${paidCount} fixed_cost, total ${total}`,
  )
})

test("SF-6 status_matrix one-week run does not stamp buyAmount as period count 1", () => {
  const { lineItems } = stampProposalForSave(
    oohProposal([burst("paid", 2500)], { grid_semantics: "status_matrix" }),
    "sf6sm01",
  )
  const buyAmount = stampedBuyAmount(lineItems[0]!)
  assert.notEqual(buyAmount, "1")
  assert.equal(buyAmount, "")
})

test("SF-6 status_matrix with bought rate stamps buyAmount and unit_rate as the rate", () => {
  const rate = 1850
  const proposal = oohProposal([burst("paid", 2500)], {
    grid_semantics: "status_matrix",
    bought_rate: rate,
  })
  const { lineItems } = stampProposalForSave(proposal, "sf6rt01")
  const line = lineItems[0]!
  assert.equal(stampedBuyAmount(line), String(rate))
  assert.notEqual(stampedBuyAmount(line), "1")
  assert.equal(line.rate, rate)
  const attrs = line.attrs as { unitRate?: unknown }
  assert.equal(String(attrs.unitRate), String(rate))

  const { items } = ingestReviewToFormLineItems({
    detected_publisher: "JCDecaux",
    publisher_confidence: 1,
    match_reasons: [],
    profile: null,
    sheet_name: "Schedule",
    column_mapping: [],
    proposal,
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: [],
      spoken: [],
    },
    ava_mapping_proposals: [],
    ava_call_count: 0,
    unmapped_column_samples: [],
    template_coverage: null,
    detected_media_type: "ooh",
    media_type_status: "detected",
    needs_catalogue_choice: false,
    source_file_name: "jcd.xlsx",
    sheets: [],
  } satisfies IngestReviewPackage)
  const form = items[0] as { unit_rate?: unknown }
  assert.equal(String(form.unit_rate), String(rate))
})

test("SF-6 status_matrix with no rate: buyAmount empty so the card || 1 is never fed a period count", () => {
  const quantity = 1
  const { lineItems } = stampProposalForSave(
    oohProposal(
      [
        {
          start_date: "2026-01-01",
          end_date: "2026-01-07",
          quantity,
          media_amount: 2500,
          booking_status: "paid",
        },
      ],
      { grid_semantics: "status_matrix" },
    ),
    "sf6nr01",
  )
  const buyAmount = stampedBuyAmount(lineItems[0]!)
  assert.equal(buyAmount, "")
  assert.notEqual(buyAmount, String(quantity))
  // Empty string is what OOHContainer's `|| "1"` sees — never the period count.
  assert.equal(oohCardBuyAmountParsed(buyAmount), 1)
})

test("SF-6 count semantics still stamps buyAmount as the spot count", () => {
  const spots = 12
  const { lineItems } = stampProposalForSave(
    {
      publisher_name: "SCA",
      media_type: "radio",
      grid_semantics: "count",
      sheet_name: "Boss Engineering",
      line_items: [
        {
          grouping: { station: "2GB" },
          panels: [
            {
              descriptors: { station: "2GB" },
              raw_unmapped: {},
              source_publisher: "SCA",
              source_row_ref: "Boss!r4",
              flights: [],
              grid_period_count: 1,
            },
          ],
          bursts: [
            {
              start_date: "2026-01-01",
              end_date: "2026-01-07",
              quantity: spots,
              media_amount: 4000,
              booking_status: "paid",
            },
          ],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 1,
        burst_count: 1,
        total_media_amount: 4000,
        file_stated_total: null,
        delta: null,
        delta_pct: null,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    "sf6ct01",
  )
  assert.equal(stampedBuyAmount(lineItems[0]!), String(spots))
})

test("SF-6 JCD converter total still $311,707.88 within 0.5% after bought-rate map", async () => {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok(review.proposal)
  const recon = review.proposal!.reconciliation
  assert.ok(
    Math.abs((recon.file_stated_total ?? 0) - JCD_STATED) < 1,
    `stated ${recon.file_stated_total}`,
  )
  assert.ok(
    Math.abs(recon.total_media_amount - JCD_STATED) / JCD_STATED <= 0.005,
    `proposal total ${recon.total_media_amount} moved — media_rate:bought was counted as media`,
  )
  const { lineItems } = stampProposalForSave(
    review.proposal!,
    "sf6jcd1",
    review.template_coverage?.resolved_controlled,
  )
  const total = lineItems.reduce((s, line) => s + stampedMoney(line), 0)
  assert.ok(
    Math.abs(total - JCD_STATED) / JCD_STATED <= 0.005,
    `JCD stamped total ${total} moved vs ${JCD_STATED} — bought rate counted as media`,
  )
  const paid = lineItems.filter((l) => l.buyType === "fixed_cost")
  assert.ok(paid.length > 0)
  for (const line of paid) {
    const bursts = Array.isArray(line.bursts) ? line.bursts : []
    for (const b of bursts) {
      const buyAmount = String((b as { buyAmount?: unknown }).buyAmount ?? "")
      assert.notEqual(
        buyAmount,
        "1",
        "period count must not land in the rate field",
      )
    }
  }
  const withRate = paid.filter((l) => {
    const rate = (l.attrs as { unitRate?: unknown } | undefined)?.unitRate
    return rate != null && String(rate).trim() !== ""
  })
  assert.ok(
    withRate.length > 0,
    "JCD MEDIA BOUGHT RATE must land on unitRate for paid lines",
  )
})
