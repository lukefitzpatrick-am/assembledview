/**
 * ingestReviewToFormLineItems — same stamp engine as accept, form-item door.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import type { SavePlanLineItem } from "@/lib/data/savePlan"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import type { IngestReviewPackage } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import type { IngestProposal, ProposedLineItem } from "../proposeLineItems"
import { stampProposalForSave } from "../stampProposalForSave"
import { ingestReviewToFormLineItems } from "../toFormLineItems"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")

function burstMoney(item: Record<string, unknown>): number {
  const bursts = Array.isArray(item.bursts) ? item.bursts : []
  return bursts.reduce(
    (sum: number, burst: { budget?: unknown }) =>
      sum + parseBurstMoney(burst.budget),
    0,
  )
}

function stampedLineMoney(line: SavePlanLineItem): number {
  const bursts = Array.isArray(line.bursts) ? line.bursts : []
  const fromBursts = bursts.reduce(
    (sum: number, burst: { budget?: unknown }) =>
      sum + parseBurstMoney(burst.budget),
    0,
  )
  return fromBursts || Number(line.enteredAmount) || 0
}

function emptyIgnored(
  labels: string[] = [],
): IngestReviewPackage["ignored"] {
  return {
    sheets_skipped: [],
    rows_unparsed: labels.length,
    rows_unparsed_labels: labels,
    columns_unmapped: [],
    spoken: labels.length > 0 ? [`unparsed ${labels.join(" / ")}`] : [],
  }
}

function emptyReconciliation(
  overrides: Partial<IngestProposal["reconciliation"]> = {},
): IngestProposal["reconciliation"] {
  return {
    line_item_count: 0,
    panel_count: 0,
    burst_count: 0,
    total_media_amount: 0,
    file_stated_total: null,
    delta: null,
    delta_pct: null,
    accept_ok: true,
    block_reason: null,
    warnings: [],
    charges_detected_total: 0,
    ...overrides,
  }
}

function proposedLine(args: {
  format: string
  market: string
  postcode: string
  mediaAmount: number
  sourceRow: string
}): ProposedLineItem {
  return {
    grouping: { format: args.format, market: args.market },
    panels: [
      {
        descriptors: {
          format: args.format,
          market: args.market,
          postcode: args.postcode,
          site_number: args.sourceRow,
        },
        raw_unmapped: {},
        source_publisher: "QMS",
        source_row_ref: args.sourceRow,
        flights: [],
        grid_period_count: 1,
      },
    ],
    bursts: [
      {
        start_date: "2026-01-05",
        end_date: "2026-01-11",
        quantity: 1,
        media_amount: args.mediaAmount,
        booking_status: "paid",
      },
    ],
  }
}

function stubReview(
  overrides: Partial<IngestReviewPackage> = {},
): IngestReviewPackage {
  return {
    detected_publisher: "QMS",
    publisher_confidence: 1,
    match_reasons: [],
    profile: null,
    sheet_name: "Sheet1",
    column_mapping: [],
    proposal: null,
    ignored: emptyIgnored(),
    ava_mapping_proposals: [],
    ava_call_count: 0,
    unmapped_column_samples: [],
    template_coverage: null,
    detected_media_type: "ooh",
    media_type_status: "detected",
    needs_catalogue_choice: false,
    source_file_name: "qms.xlsx",
    sheets: [],
    ...overrides,
  }
}

async function reviewFromFixture(file: string): Promise<IngestReviewPackage> {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, file),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok(review.proposal, `${file} missing proposal`)
  return review
}

function assertMatchesAcceptWrite(review: IngestReviewPackage, mba: string) {
  const stamped = stampProposalForSave(review.proposal!, mba)
  const converted = ingestReviewToFormLineItems(review)
  assert.equal(converted.items.length, stamped.lineItems.length)
  let convertedTotal = 0
  let stampedTotal = 0
  for (let i = 0; i < stamped.lineItems.length; i++) {
    const formItem = converted.items[i] as Record<string, unknown>
    const line = stamped.lineItems[i]!
    const formMoney = burstMoney(formItem)
    const acceptMoney = stampedLineMoney(line)
    assert.equal(
      formMoney,
      acceptMoney,
      `line[${i}] money form ${formMoney} vs accept ${acceptMoney}`,
    )
    convertedTotal += formMoney
    stampedTotal += acceptMoney
  }
  assert.equal(convertedTotal, stampedTotal)
  return { converted, stamped, convertedTotal, stampedTotal }
}

test("QMS converter line count, per-line money and total match accept stamp", async () => {
  const review = await reviewFromFixture("qms_strength-meals_esb-ooh.xlsx")
  const { converted, stamped, convertedTotal } = assertMatchesAcceptWrite(
    review,
    "qmsround01",
  )
  assert.equal(converted.channel, "ooh")
  assert.equal(converted.items.length, 41)
  assert.equal(stamped.lineItems.length, 41)
  const stated = review.proposal!.reconciliation.file_stated_total
  if (stated != null && stated > 0) {
    assert.ok(
      Math.abs(convertedTotal - stated) / stated <= 0.005,
      `converter total ${convertedTotal} vs file ${stated}`,
    )
  }
})

test("JCD converter line count, per-line money and total match accept stamp", async () => {
  const review = await reviewFromFixture("jcd_strength-meals_ooh.xlsx")
  const { converted, convertedTotal } = assertMatchesAcceptWrite(
    review,
    "glenda0090h1",
  )
  assert.equal(converted.channel, "ooh")
  assert.equal(converted.items.length, 106)
  const stated = review.proposal!.reconciliation.file_stated_total ?? 0
  assert.ok(Math.abs(stated - 311707.88) < 1)
  assert.ok(
    Math.abs(convertedTotal - stated) / stated <= 0.005,
    `converter total ${convertedTotal} vs file ${stated}`,
  )
  const skippedHay = converted.skipped.join(" | ").toUpperCase()
  for (const name of ["MEDIA VALUE", "DISCOUNT", "CAMPAIGN SUMMARY"]) {
    assert.ok(
      skippedHay.includes(name),
      `JCD skipped must name ${name}, got ${converted.skipped.join(", ")}`,
    )
  }
})

test("each form line keeps its own row descriptors, not the first row's", () => {
  const first = proposedLine({
    format: "Portrait",
    market: "Sydney",
    postcode: "2000",
    mediaAmount: 10.25,
    sourceRow: "Paid!r10",
  })
  const second = proposedLine({
    format: "Landscape",
    market: "Melbourne",
    postcode: "3000",
    mediaAmount: 20.5,
    sourceRow: "Paid!r11",
  })
  const review = stubReview({
    proposal: {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [first, second],
      reconciliation: emptyReconciliation({
        line_item_count: 2,
        panel_count: 2,
        burst_count: 2,
        total_media_amount: 30.75,
      }),
    },
  })
  const { items } = ingestReviewToFormLineItems(review)
  assert.equal(items.length, 2)
  const a = items[0] as Record<string, unknown>
  const b = items[1] as Record<string, unknown>
  assert.equal(a.format, "")
  assert.equal(a.market, "Sydney")
  assert.equal(b.format, "")
  assert.equal(b.market, "Melbourne")
  const aAttrs = a.attrs as { publisher_format_name?: string }
  const bAttrs = b.attrs as { publisher_format_name?: string }
  assert.equal(aAttrs.publisher_format_name, "Portrait")
  assert.equal(bAttrs.publisher_format_name, "Landscape")
  assert.notEqual(aAttrs.publisher_format_name, bAttrs.publisher_format_name)
})

test("postcodes stay strings with leading zeros", () => {
  const review = stubReview({
    proposal: {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [
        proposedLine({
          format: "Portrait",
          market: "Darwin",
          postcode: "0800",
          mediaAmount: 1000.55,
          sourceRow: "Paid!r4",
        }),
      ],
      reconciliation: emptyReconciliation({
        line_item_count: 1,
        panel_count: 1,
        burst_count: 1,
        total_media_amount: 1000.55,
      }),
    },
  })
  const stamped = stampProposalForSave(review.proposal!, "postc001")
  const { items } = ingestReviewToFormLineItems(review)
  assert.equal(items.length, 1)
  const item = items[0] as Record<string, unknown>
  const panels = item.panels as Array<{ postcode?: unknown }> | undefined
  assert.ok(Array.isArray(panels) && panels.length === 1)
  assert.equal(typeof panels[0]!.postcode, "string")
  assert.equal(panels[0]!.postcode, "0800")
  assert.equal(stamped.panels[0]!.postcode, "0800")
  const attrs = item.attrs as { ingest_source_row_refs?: string[] }
  assert.deepEqual(attrs.ingest_source_row_refs, ["Paid!r4"])
  assert.equal(item.line_item_id, undefined)
  assert.equal(item.lineItemId, undefined)
  assert.equal(burstMoney(item), stampedLineMoney(stamped.lineItems[0]!))
})

test("SCA converter line count and per-line money match accept stamp", async () => {
  const review = await reviewFromFixture("sca_boss-engineering_fy26_v2-rev.xlsx")
  const { converted } = assertMatchesAcceptWrite(review, "sca001")
  assert.equal(converted.channel, "radio")
  assert.ok(converted.items.length >= 1)
})

test("rows the review flagged for review are named in skipped, not dropped silently", () => {
  const review = stubReview({
    ignored: emptyIgnored(["MEDIA VALUE", "DISCOUNT", "CAMPAIGN SUMMARY"]),
    proposal: {
      publisher_name: "JCDecaux",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [
        proposedLine({
          format: "Portrait",
          market: "Sydney",
          postcode: "2000",
          mediaAmount: 50,
          sourceRow: "Paid!r8",
        }),
      ],
      reconciliation: emptyReconciliation({
        line_item_count: 1,
        panel_count: 1,
        burst_count: 1,
        total_media_amount: 50,
      }),
    },
  })
  const { items, skipped } = ingestReviewToFormLineItems(review)
  assert.equal(items.length, 1)
  const hay = skipped.join(" | ").toUpperCase()
  for (const name of ["MEDIA VALUE", "DISCOUNT", "CAMPAIGN SUMMARY"]) {
    assert.ok(hay.includes(name), `expected skipped to name ${name}, got ${skipped.join(", ")}`)
  }
})
